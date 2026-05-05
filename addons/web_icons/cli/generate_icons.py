# Part of Odoo. See LICENSE file for full copyright and licensing details.
"""CLI command: odoo-bin generate_icons

Two-stage pipeline:

1. **Download** — fetch a variable WOFF2 subset for the requested icons from the
   Google Fonts API (both *Outlined* and *Sharp* variants).  The subset is small
   (~39 kb for 350 icons) and has the FILL axis intact.

2. **Process** — use fontTools to bake the FILL axis into two static glyph ranges
   and map them to Unicode Private Use Area (PUA) code points::

       U+E000 … U+E000+N-1   → outlined glyphs  (FILL=0)
       U+E000+N … U+E000+2N-1 → filled glyphs    (FILL=1)

   The resulting WOFF2 has **no variable axes** — fill is toggled purely by CSS::

       [data-icon="favorite"]::before         { content: "\\E06D"; }  /* outlined */
       [data-icon="favorite"].oi-filled::before { content: "\\E199"; }  /* filled   */

This eliminates the need to keep full (450 kb) source fonts in the repository.
Font size scales linearly: ~22 kb for 350 icons regardless of which icons are
requested (unlike the variable ligature approach whose size is non-linear).

Outputs
-------
* ``static/src/fonts/ms_pua_outlined.woff2``
* ``static/src/fonts/ms_pua_sharp.woff2``
* ``static/src/_icons_variables.scss``        — ``$icon-pua-map``, ``$icon-*`` vars
* ``static/src/icons_pua.scss``               — per-icon ``::before`` rules
* ``static/src/data/icons_pua_map.json``      — JS consumer map

Usage
-----
::

    python odoo-bin --addons-path=addons generate_icons
    python odoo-bin --addons-path=addons generate_icons --dry-run

Dependencies
------------
::

    pip install fonttools brotli
"""

import json
import logging
import re
import sys
import urllib.request
from io import BytesIO
from pathlib import Path

from odoo.cli import Command
from odoo.modules import get_module_path

_logger = logging.getLogger(__name__)

PUA_OUTLINED_START = 0xE000

GOOGLE_FONTS_API = "https://fonts.googleapis.com/css2"
GOOGLE_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)


# ---------------------------------------------------------------------------
# Stage 1 — Download from Google Fonts
# ---------------------------------------------------------------------------

def _load_wishlist(path: Path) -> list[str]:
    with path.open(encoding='utf-8') as fh:
        data = json.load(fh)
    if isinstance(data, list):
        return [str(n) for n in data]
    if isinstance(data, dict) and 'icons' in data:
        return [str(n) for n in data['icons']]
    raise ValueError(f"Unexpected wishlist format in {path}.")


def _fetch_google_font(style: str, icon_names: list[str]) -> bytes:
    """Download a variable WOFF2 subset from Google Fonts.

    The returned font is a ~39 kb variable font with the FILL axis intact and
    a full GSUB ligature table — exactly what we need for Stage 2 processing.
    """
    sorted_names = sorted(icon_names)
    family = f"Material+Symbols+{style}"
    icons_param = ",".join(sorted_names)
    url = (
        f"{GOOGLE_FONTS_API}"
        f"?family={family}:opsz,wght,FILL,GRAD@24,400,0..1,0"
        f"&icon_names={icons_param}"
    )
    _logger.info("Fetching Google Fonts CSS (%s, %d icons)…", style, len(sorted_names))
    req = urllib.request.Request(url, headers={"User-Agent": GOOGLE_USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            css = resp.read().decode("utf-8")
    except Exception as exc:
        raise SystemExit(f"Failed to fetch Google Fonts CSS: {exc}") from exc

    match = re.search(r"url\((https://fonts\.gstatic\.com/[^)]+)\)", css)
    if not match:
        raise SystemExit(
            f"Could not find a font URL in the Google Fonts CSS response.\n"
            f"Response preview:\n{css[:600]}"
        )
    font_url = match.group(1)
    _logger.info("Downloading variable font from gstatic.com…")
    try:
        with urllib.request.urlopen(font_url, timeout=60) as resp:
            return resp.read()
    except Exception as exc:
        raise SystemExit(f"Failed to download font binary: {exc}") from exc


# ---------------------------------------------------------------------------
# Stage 2 — GSUB resolution + PUA font building
# ---------------------------------------------------------------------------

def _detect_fill_variants(font0, font1, icon_to_glyph: dict, icon_names: list) -> set:
    """Return the subset of icon_names whose glyph outline actually differs
    between FILL=0 (font0) and FILL=1 (font1).

    Icons like ``add``, ``close``, ``check`` are pure geometric shapes whose
    outlines don't change with the FILL axis — we skip the filled glyph copy
    for those so we don't bloat the font with duplicate glyph data.
    """
    try:
        from fontTools.pens.recordingPen import RecordingPen
    except ImportError:
        # fontTools not fully available — assume all icons have fill
        return set(icon_names)

    gs0 = font0.getGlyphSet()
    gs1 = font1.getGlyphSet()
    has_fill = set()

    for name in icon_names:
        glyph_name = icon_to_glyph.get(name)
        if not glyph_name:
            continue
        pen0, pen1 = RecordingPen(), RecordingPen()
        try:
            gs0[glyph_name].draw(pen0)
            gs1[glyph_name].draw(pen1)
        except Exception:
            has_fill.add(name)   # cannot compare → assume fill exists
            continue
        if pen0.value != pen1.value:
            has_fill.add(name)

    return has_fill

def _real_subtables(lookup):
    """Yield (lookup_type, subtable), unwrapping type-7 Extension lookups."""
    if lookup.LookupType == 7:
        for sub in lookup.SubTable:
            yield sub.ExtSubTable.LookupType, sub.ExtSubTable
    else:
        for sub in lookup.SubTable:
            yield lookup.LookupType, sub


def _apply_liga(sub, seq: list) -> list:
    if not seq or not hasattr(sub, 'ligatures') or seq[0] not in sub.ligatures:
        return seq
    for lig in sub.ligatures[seq[0]]:
        comp = list(lig.Component)
        if seq[1:1 + len(comp)] == comp:
            return [lig.LigGlyph] + list(seq[1 + len(comp):])
    return seq


def _resolve_icons(font, icon_names: list[str]) -> dict[str, str]:
    """Return {icon_name: glyph_name} by tracing each name through GSUB.

    Uses a two-pass strategy:

    1. **Type-4 only** (ligature substitutions) — resolves to the base variable
       glyph (``uniE87D``, ``uniE88A`` …) that retains the FILL axis variation
       in ``gvar``.  This is the preferred target for PUA mapping.

    2. **Full chain** (type-1 + type-4) — fallback for icons whose sequence
       cannot be resolved by ligature lookup alone.  Type-1 (single
       substitution) in Material Symbols fonts maps outlined glyphs to their
       pre-baked solid counterparts; applying it unconditionally would discard
       the FILL variation data we need.
    """
    gsub = font['GSUB'].table
    cmap = font.getBestCmap()

    def _run(name, *, use_type1: bool):
        seq = [cmap.get(ord(c)) for c in name.replace('-', '_')]
        if None in seq:
            return None
        for lookup in gsub.LookupList.Lookup:
            changed = True
            while changed:
                changed = False
                for ltype, sub in _real_subtables(lookup):
                    if ltype == 1 and use_type1:
                        new = [
                            (sub.mapping.get(g, g) if hasattr(sub, 'mapping') else g)
                            for g in seq
                        ]
                        if new != seq:
                            seq = new; changed = True
                    elif ltype == 4:
                        new, i = [], 0
                        while i < len(seq):
                            r = _apply_liga(sub, seq[i:])
                            if r != seq[i:]:
                                new.extend(r); i = len(seq); changed = True
                            else:
                                new.append(seq[i]); i += 1
                        seq = new
        return seq[0] if len(seq) == 1 else None

    results = {}
    for name in icon_names:
        # Prefer type-4-only result — it keeps the variable glyph whose FILL
        # axis variation lets us generate distinct outlined / filled PUA glyphs.
        g = _run(name, use_type1=False)
        if g is None:
            # Cannot resolve with ligatures alone; fall back to full chain.
            g = _run(name, use_type1=True)
        if g is not None:
            results[name] = g
    return results


def _build_pua_font(
    font_bytes: bytes,
    dst_path: Path,
    icon_to_glyph: dict[str, str],
    resolved: list[str],
) -> tuple[int, set]:
    """Build a static PUA-mapped WOFF2 with outlined AND (where applicable) filled glyphs.

    For N icons:

    * U+E000 … U+E000+N-1     → outlined glyphs for all icons
    * U+E000+N … U+E000+2N-1  → filled glyphs for icons that *actually differ*
                                  between FILL=0 and FILL=1; the remaining icons
                                  in this range map to their outlined glyph.

    Returns ``(file_size_bytes, icons_with_fill_set)``.
    """
    try:
        from fontTools.ttLib import TTFont
        from fontTools import subset as ft_subset
        from fontTools.varLib import instancer as vl_instancer
    except ImportError as exc:
        raise SystemExit(
            "fontTools is required.\n"
            "Install with:  pip install fonttools brotli"
        ) from exc

    N = len(resolved)
    PUA_FILLED_START = PUA_OUTLINED_START + N

    font0 = TTFont(BytesIO(font_bytes), recalcBBoxes=False, recalcTimestamp=False)
    vl_instancer.instantiateVariableFont(font0, {'FILL': 0}, inplace=True)

    font1 = TTFont(BytesIO(font_bytes), recalcBBoxes=False, recalcTimestamp=False)
    vl_instancer.instantiateVariableFont(font1, {'FILL': 1}, inplace=True)

    # Detect which icons actually differ between fill states
    icons_with_fill = _detect_fill_variants(font0, font1, icon_to_glyph, resolved)

    glyf0 = font0['glyf']
    glyf1 = font1['glyf']
    hmtx0 = font0['hmtx']
    hmtx1 = font1['hmtx']

    filled_names = []
    for name in resolved:
        if name in icons_with_fill:
            g   = icon_to_glyph[name]
            g_f = g + '_f'
            glyf0[g_f]         = glyf1[g]
            hmtx0.metrics[g_f] = hmtx1.metrics[g]
            filled_names.append(g_f)

    if filled_names:
        font0.setGlyphOrder(font0.getGlyphOrder() + filled_names)
        font0['maxp'].numGlyphs = len(font0.getGlyphOrder())

    # Add PUA cmap entries:
    #   outlined range → always the outlined glyph
    #   filled range   → actual filled glyph if available, else reuse outlined
    for table in font0['cmap'].tables:
        if table.isUnicode():
            for i, name in enumerate(resolved):
                g = icon_to_glyph[name]
                table.cmap[PUA_OUTLINED_START + i] = g
                table.cmap[PUA_FILLED_START   + i] = (g + '_f') if name in icons_with_fill else g

    buf = BytesIO()
    font0.save(buf)
    buf.seek(0)

    all_pua = (
        list(range(PUA_OUTLINED_START, PUA_OUTLINED_START + N)) +
        list(range(PUA_FILLED_START,   PUA_FILLED_START   + N))
    )

    opts = ft_subset.Options()
    opts.flavor          = 'woff2'
    opts.layout_features = []
    opts.hinting         = False
    opts.desubroutinize  = True
    opts.name_IDs        = [1, 2, 4]
    opts.drop_tables     = ['DSIG', 'GPOS', 'kern', 'GSUB']

    font2 = ft_subset.load_font(buf, opts)
    sub   = ft_subset.Subsetter(options=opts)
    sub.populate(unicodes=all_pua)
    sub.subset(font2)

    dst_path.parent.mkdir(parents=True, exist_ok=True)
    font2.save(str(dst_path))
    return dst_path.stat().st_size, icons_with_fill


# ---------------------------------------------------------------------------
# Output writers
# ---------------------------------------------------------------------------

def _write_scss(scss_path: Path, resolved: list[str], icons_with_fill: set) -> None:
    """``icons_pua.scss`` — outlined rule for every icon; filled rule only where
    FILL=0 and FILL=1 produce distinct glyphs."""
    N = len(resolved)
    lines = [
        "// Generated by `odoo-bin generate_icons` — do not edit manually.",
        "// outlined glyph: [data-icon=\"name\"]::before",
        "// filled   glyph: [data-icon=\"name\"].oi-filled::before (only where fill differs)",
        "",
    ]
    for i, name in enumerate(resolved):
        cp_out  = PUA_OUTLINED_START + i
        cp_fill = PUA_OUTLINED_START + N + i
        lines.append(
            f'[data-icon="{name}"]::before {{ content: "\\{cp_out:04X}"; }}'
        )
        if name in icons_with_fill:
            lines.append(
                f'[data-icon="{name}"].oi-filled::before {{ content: "\\{cp_fill:04X}"; }}'
            )
    scss_path.write_text('\n'.join(lines) + '\n', encoding='utf-8')



def _write_json_map(json_path: Path, resolved: list[str], icons_with_fill: set) -> None:
    """``icons_pua_map.json`` — JS consumer map."""
    N = len(resolved)
    mapping = {
        name: {
            "outlined": chr(PUA_OUTLINED_START + i),
            "filled": chr(PUA_OUTLINED_START + N + i) if name in icons_with_fill
                      else chr(PUA_OUTLINED_START + i),
        }
        for i, name in enumerate(resolved)
    }
    json_path.write_text(
        json.dumps(mapping, ensure_ascii=False, indent=2) + '\n',
        encoding='utf-8',
    )


def _write_font_face_css(ms_dir: Path, style_lower: str, font_file: str) -> None:
    css = (
        f"/* Generated by `odoo-bin generate_icons` — do not edit manually. */\n"
        f"@font-face {{\n"
        f"    font-family: 'material_symbols_{style_lower}';\n"
        f"    font-style: normal;\n"
        f"    font-weight: 400;\n"
        f"    font-display: block;\n"
        f"    src: url('/web_icons/static/src/fonts/{font_file}') format('woff2');\n"
        f"}}\n"
    )
    ms_dir.mkdir(parents=True, exist_ok=True)
    (ms_dir / f'material_symbols_{style_lower}.css').write_text(css, encoding='utf-8')


# ---------------------------------------------------------------------------
# Command
# ---------------------------------------------------------------------------

class Generateicons(Command):
    """Generate PUA-mapped Material Symbols fonts for the web_icons module.

    Downloads variable subsets from Google Fonts (no local source fonts needed),
    then processes them locally with fontTools to produce static PUA-mapped fonts
    with the FILL axis baked in as two separate glyph ranges.

    Result: ~22 kb per variant (350 icons × 2 fill states), linear scaling.

    Run once after cloning and whenever the wishlist changes::

        python odoo-bin --addons-path=addons generate_icons

    Requires::

        pip install fonttools brotli
    """

    name = 'generate_icons'

    def run(self, cmdargs: list[str]) -> None:
        self.parser.add_argument('--wishlist', default=None, metavar='PATH')
        self.parser.add_argument('--dry-run', action='store_true')
        args = self.parser.parse_args(cmdargs)

        module_path = Path(get_module_path('web_icons', display_warning=False) or '')
        if not module_path.exists():
            sys.exit("Could not locate the 'web_icons' module.")

        fonts_dir  = module_path / 'static' / 'src' / 'fonts'
        static_dir = module_path / 'static' / 'src'
        ms_dir     = module_path / 'static' / 'src' / 'materialsymbols'
        data_dir   = module_path / 'static' / 'src' / 'data'

        wishlist_path = (
            Path(args.wishlist) if args.wishlist
            else data_dir / 'icons_wishlist.json'
        )
        if not wishlist_path.is_file():
            sys.exit(f"Wishlist not found: {wishlist_path}")

        wishlist = sorted(_load_wishlist(wishlist_path))

        if args.dry_run:
            print(f"Dry-run — {len(wishlist)} icons (sorted):")  # noqa: T201
            for n in wishlist:
                print(f"  {n}")  # noqa: T201
            return

        try:
            from fontTools.ttLib import TTFont
        except ImportError as exc:
            raise SystemExit("fontTools is required.  pip install fonttools brotli") from exc

        # ── Stage 1: Download variable WOFF2 from Google Fonts ─────────────
        font_bytes_o = _fetch_google_font("Outlined", wishlist)
        font_bytes_s = _fetch_google_font("Sharp",    wishlist)

        # ── Stage 2a: Resolve icon names → glyph names via GSUB ────────────
        _logger.info("Resolving GSUB (outlined)…")
        src_o = TTFont(BytesIO(font_bytes_o), recalcBBoxes=False, recalcTimestamp=False)
        glyph_o = _resolve_icons(src_o, wishlist)

        _logger.info("Resolving GSUB (sharp)…")
        src_s = TTFont(BytesIO(font_bytes_s), recalcBBoxes=False, recalcTimestamp=False)
        glyph_s = _resolve_icons(src_s, wishlist)

        resolved = sorted(n for n in wishlist if n in glyph_o and n in glyph_s)
        skipped  = [n for n in wishlist if n not in resolved]
        if skipped:
            _logger.warning("%d icons could not be resolved: %s", len(skipped), skipped)

        print(f"Resolved: {len(resolved)}/{len(wishlist)} icons")  # noqa: T201

        # ── Stage 2b: Build static PUA fonts ───────────────────────────────
        _logger.info("Building PUA outlined font…")
        s1, fill_o = _build_pua_font(font_bytes_o, fonts_dir / 'ms_pua_outlined.woff2', glyph_o, resolved)

        _logger.info("Building PUA sharp font…")
        s2, fill_s = _build_pua_font(font_bytes_s, fonts_dir / 'ms_pua_sharp.woff2', glyph_s, resolved)

        # An icon "has fill" only if BOTH variants produce a distinct filled glyph.
        # (If one variant doesn't change with fill, we don't generate a .oi-filled rule.)
        icons_with_fill = fill_o & fill_s
        icons_no_fill   = set(resolved) - icons_with_fill
        print(  # noqa: T201
            f"  {len(icons_with_fill)} icons with fill variant, "
            f"{len(icons_no_fill)} icons without (outlined used for both states)"
        )

        # ── Stage 3: Write supporting files ────────────────────────────────
        _write_scss(static_dir / 'icons_pua.scss', resolved, icons_with_fill)
        _write_json_map(data_dir / 'icons_pua_map.json', resolved, icons_with_fill)
        _write_font_face_css(ms_dir, 'outlined', 'ms_pua_outlined.woff2')
        _write_font_face_css(ms_dir, 'sharp',    'ms_pua_sharp.woff2')

        print(  # noqa: T201
            f"\n✓  Generated PUA fonts ({len(resolved)} icons × 2 fill states)\n"
            f"   outlined  → {fonts_dir / 'ms_pua_outlined.woff2'}  ({s1 // 1024} kb)\n"
            f"   sharp     → {fonts_dir / 'ms_pua_sharp.woff2'}  ({s2 // 1024} kb)\n"
            f"   scss      → {static_dir / 'icons_pua.scss'}\n"
            f"   map       → {data_dir / 'icons_pua_map.json'}\n"
        )
