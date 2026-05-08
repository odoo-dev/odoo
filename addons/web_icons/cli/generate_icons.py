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
import subprocess
import sys
import tempfile
import urllib.request
from copy import deepcopy
from io import BytesIO
from pathlib import Path

from odoo.cli import Command
from odoo.modules import get_module_path

try:
    from fontTools.misc.transform import Transform
    from fontTools.pens.recordingPen import RecordingPen
    from fontTools.pens.transformPen import TransformPen
    from fontTools.pens.ttGlyphPen import TTGlyphPen
    from fontTools.ttLib import TTFont
    from fontTools.varLib import instancer as vl_instancer
except ImportError as exc:
    msg = "fontTools is required.\n"
    raise SystemExit(
        msg,
        "Install with:  pip install fonttools brotli",
    ) from exc


_logger = logging.getLogger(__name__)

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
# Stage 2 — GSUB resolution
# ---------------------------------------------------------------------------

def _detect_fill_variants(font0, font1, icon_to_glyph: dict, icon_names: list) -> set:
    """Return the subset of icon_names whose glyph outline actually differs
    between FILL=0 (font0) and FILL=1 (font1).

    Icons like ``add``, ``close``, ``check`` are pure geometric shapes whose
    outlines don't change with the FILL axis — we skip the filled glyph copy
    for those so we don't bloat the font with duplicate glyph data.
    """
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


def _add_suffix_to_symbols(font: TTFont, suffix: str) -> TTFont:
    """
    Appends `suffix` to the input string of every ligature in the font
    (GSUB type-4, including Extension-wrapped type-6 lookups).

    E.g. with suffix="_f", the ligature that fires on "home" will instead
    fire on "home_f", leaving the result glyph name unchanged.

    The font must already contain glyphs for every character in `suffix`
    (e.g. glyphs named "underscore" and "f" for "_f").
    """
    # Map each character in the suffix to its glyph name.
    # fontTools uses the glyph name, not the unicode character directly.
    cmap = font.getBestCmap()  # codepoint → glyph name
    suffix_glyphs = []
    for ch in suffix:
        cp = ord(ch)
        glyph_name = cmap.get(cp)
        if glyph_name is None:
            raise ValueError(
                f"No glyph found for character {ch!r} (U+{cp:04X}) in font. "
                f"The font must contain all characters in the suffix."
            )
        suffix_glyphs.append(glyph_name)

    def iter_lig_subtables(font):
        gsub = font.get("GSUB")
        if not gsub:
            return
        for lookup in gsub.table.LookupList.Lookup:
            for subtable in lookup.SubTable:
                real = getattr(subtable, "ExtSubTable", subtable)
                if real.LookupType == 4:
                    yield real

    # Append suffix_glyphs to every ligature's Component list
    for subtable in iter_lig_subtables(font):
        for lig_set in subtable.ligatures.values():
            for lig in lig_set:
                lig.Component = lig.Component + suffix_glyphs

    return font


def _concat_fonts(font_a: TTFont, font_b: TTFont) -> TTFont:
    """
    Merge font_b into font_a and return font_a.

    - All glyphs from font_b are copied into font_a (skipping duplicates).
    - All GSUB LigatureSubst (type-4) lookups from font_b are appended
        to font_a's GSUB LookupList.
    - cmap entries from font_b are merged into font_a (font_a wins on conflict).
    """
    glyph_order_a = set(font_a.getGlyphOrder())

    # 1. Copy glyphs from font_b that don't already exist in font_a
    new_glyphs = [name for name in font_b.getGlyphOrder() if name not in glyph_order_a]

    for name in new_glyphs:
        font_a["glyf"].glyphs[name] = deepcopy(font_b["glyf"].glyphs[name])
        font_a["hmtx"].metrics[name] = font_b["hmtx"].metrics[name]
        if "gvar" in font_b and "gvar" in font_a and name in font_b["gvar"].variations:
            font_a["gvar"].variations[name] = deepcopy(font_b["gvar"].variations[name])

    font_a.setGlyphOrder(font_a.getGlyphOrder() + new_glyphs)

    # 2. Append GSUB ligature lookups from font_b into font_a
    gsub_a = font_a.get("GSUB")
    gsub_b = font_b.get("GSUB")

    if gsub_b and gsub_a:
        lookups_a = gsub_a.table.LookupList.Lookup
        lookups_b = gsub_b.table.LookupList.Lookup

        # Collect type-4 lookup indices from font_b (unwrapping extensions)
        for lookup in lookups_b:
            for subtable in lookup.SubTable:
                real = getattr(subtable, "ExtSubTable", subtable)
                if real.LookupType == 4:
                    lookups_a.append(deepcopy(lookup))
                    break

        # Add the new lookup indices to every FeatureRecord that uses ligatures
        n_lookups_a_original = len(lookups_a) - sum(
            1 for lk in lookups_b
            if any(getattr(getattr(st, "ExtSubTable", st), "LookupType", None) == 4
                    for st in lk.SubTable)
        )
        new_indices = list(range(n_lookups_a_original, len(lookups_a)))

        for feature_record in gsub_a.table.FeatureList.FeatureRecord:
            feature = feature_record.Feature
            if any(i < n_lookups_a_original and
                    any(getattr(getattr(st, "ExtSubTable", st), "LookupType", None) == 4
                        for st in lookups_a[i].SubTable)
                    for i in feature.LookupListIndex):
                for idx in new_indices:
                    if idx not in feature.LookupListIndex:
                        feature.LookupListIndex.append(idx)

    # 3. Reposition glyphs
    scale_x, scale_y = 1.2, 1.2

    glyf_table = font_a['glyf']
    glyph_set = font_a.getGlyphSet()

    for target_glyph in glyph_set:
        glyph = glyf_table[target_glyph]
        if glyph.numberOfContours == 0:
            # Skip empty glyphs (like spaces)
            continue

        hmtx = font_a['hmtx']
        current_width, lsb = hmtx[target_glyph]
        visual_width = glyph.xMax - glyph.xMin
        move_x = round(((current_width - visual_width)) * scale_x)

        tt_pen = TTGlyphPen(glyf_table)
        transform = Transform().translate(move_x, 0).scale(scale_x, scale_y)
        transform_pen = TransformPen(tt_pen, transform)

        glyph_set[target_glyph].draw(transform_pen)
        glyf_table[target_glyph] = tt_pen.glyph()

        new_width = round(current_width * scale_x)
        new_lsb = int(lsb + move_x)
        hmtx[target_glyph] = (new_width, new_lsb)

    return font_a


def _build_optimized_subset(
    font: TTFont,
    icons: list[str],
):
    input_path = Path(tempfile.gettempdir()) / 'temp_font.woff2'
    output_path = input_path.with_suffix('.out.woff2')
    font.save(input_path)

    subprocess.call([
        "npx", "fontext",
        "-l", ",".join(icons),
        "-i", str(input_path),
        "-o", str(output_path.parent),
        "-n", str(output_path.stem),
        "-f", "woff2",
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    res_font = TTFont(output_path)

    input_path.unlink(missing_ok=True)
    output_path.unlink(missing_ok=True)

    return res_font


def _build_splitted_font(
    font: TTFont,
    dst_path: Path,
    icon_to_glyph: dict[str, str],
    resolved: list[str],
) -> tuple[set, int]:
    font_fill = vl_instancer.instantiateVariableFont(font, {'FILL': 1})
    font_outline = vl_instancer.instantiateVariableFont(font, {'FILL': 0})

    icons_with_fill = _detect_fill_variants(font_outline, font_fill, icon_to_glyph, resolved)
    fill_suffix = "_f"
    icons_suffixed = [i + fill_suffix for i in icons_with_fill]
    font_fill = _add_suffix_to_symbols(font_fill, fill_suffix)

    merged = _concat_fonts(
        _build_optimized_subset(font_fill, icons_suffixed),
        _build_optimized_subset(font_outline, resolved),
    )
    merged.save(dst_path)

    return icons_with_fill, dst_path.stat().st_size


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

        static_dir = module_path / 'static' / 'src'
        fonts_dir  = static_dir / 'fonts'
        ms_dir     = static_dir / 'materialsymbols'
        data_dir   = static_dir / 'data'

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
        font_o = TTFont(BytesIO(font_bytes_o), recalcBBoxes=False, recalcTimestamp=False)
        glyph_o = _resolve_icons(font_o, wishlist)

        _logger.info("Resolving GSUB (sharp)…")
        font_s = TTFont(BytesIO(font_bytes_s), recalcBBoxes=False, recalcTimestamp=False)
        glyph_s = _resolve_icons(font_s, wishlist)

        resolved = sorted(n for n in wishlist if n in glyph_o and n in glyph_s)
        skipped  = [n for n in wishlist if n not in resolved]
        if skipped:
            _logger.warning("%d icons could not be resolved: %s", len(skipped), skipped)

        print(f"Resolved: {len(resolved)}/{len(wishlist)} icons")  # noqa: T201

        # ── Stage 2b: Build static PUA fonts ───────────────────────────────
        _logger.info("Building outlined font…")
        outline_path = fonts_dir / 'ms_outlined.woff2'
        fill_o, s1 = _build_splitted_font(font_o, outline_path, glyph_o, resolved)

        _logger.info("Building sharp font…")
        sharp_path = fonts_dir / 'ms_sharp.woff2'
        _, s2 = _build_splitted_font(font_s, sharp_path, glyph_s, resolved)

        icons_with_fill = fill_o
        icons_no_fill   = set(resolved) - icons_with_fill

        icons_data = {icon: {"has_fill": icon in icons_with_fill} for icon in resolved}
        (data_dir / 'icons.json').write_text(json.dumps(icons_data), encoding='utf-8')
        print(  # noqa: T201
            f"  {len(icons_with_fill)} icons with fill variant, "
            f"{len(icons_no_fill)} icons without (outlined used for both states)"
        )

        # ── Stage 3: Write supporting files ────────────────────────────────
        _write_font_face_css(ms_dir, 'outlined', outline_path.name)
        _write_font_face_css(ms_dir, 'sharp',    sharp_path.name)

        print(  # noqa: T201
            f"\n✓  Generated fonts ({len(resolved)} icons × 2 fill states)\n"
            f"   outlined  → {outline_path}  ({s1 // 1024} kb)\n"
            f"   sharp     → {sharp_path}  ({s2 // 1024} kb)\n"
        )
