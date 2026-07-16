from argparse import ArgumentParser
from os import listdir
from os.path import join

import lxml.html
import polib


# ANSI color codes for terminal output
class Colors:
    RESET = "\033[0m"
    RED = "\033[31m"
    GREEN = "\033[32m"
    YELLOW = "\033[33m"
    CYAN = "\033[36m"
    DIM = "\033[2m"
    BOLD = "\033[1m"


def _is_icon_class(cls):
    return cls in ("fa", "oi") or cls.startswith(("oi-", "fa-"))


def _analyze_icon_node(node):
    """Return (icon_classes, icon_attrs) for a node."""
    icon_classes = {c for c in node.classes if _is_icon_class(c)}
    icon_attrs = {}
    if "data-icon" in node.attrib:
        icon_attrs["data-icon"] = node.attrib["data-icon"]
    return icon_classes, icon_attrs


def _serialize_dom(dom):
    return (dom.text or "") + "".join(
        lxml.html.tostring(child, encoding="unicode", method="xml")
        for child in dom
    )


def _extract_icon_tag(html_str):
    """Extract the icon tag from HTML string for display."""
    try:
        dom = lxml.html.fragment_fromstring(html_str, create_parent=True)
        for node in dom.iter():
            icon_classes, icon_attrs = _analyze_icon_node(node)
            if icon_classes or icon_attrs:
                return lxml.html.tostring(node, encoding="unicode", method="xml")
    except Exception:
        pass
    return "?"


def _format_change(old_val, new_val):
    """Format a before/after change with colors."""
    return (
        f"  {Colors.RED}- {old_val}{Colors.RESET}\n"
        f"  {Colors.GREEN}+ {new_val}{Colors.RESET}"
    )


def compute_diff(segment):
    """Parse the segment's msgid as HTML, extract icon info, compute sanitized form."""
    dom = lxml.html.fragment_fromstring(segment.msgid, create_parent=True)

    icon_nodes = []
    for node in dom.iter():
        icon_classes, icon_attrs = _analyze_icon_node(node)
        if icon_classes or icon_attrs:
            icon_nodes.append((node, icon_classes, icon_attrs))

    segment.icon_count = len(icon_nodes)
    segment.icon_classes = set()
    segment.icon_attrs = {}

    for node, classes, attrs in icon_nodes:
        for cls in classes:
            node.classes.remove(cls)
        for attr in attrs:
            del node.attrib[attr]
        segment.icon_classes |= classes
        segment.icon_attrs.update(attrs)

    segment.sanitized_msgid = _serialize_dom(dom)
    return segment


def rewrite_msgstr(msgstr, old_icon_classes, old_icon_attrs, new_icon_classes, new_icon_attrs):
    """Patch the icon element inside msgstr from the old form to the new form.

    Returns the patched msgstr, or None if the icon element couldn't be found.
    Returns msgstr unchanged if msgstr is empty.
    """
    if not msgstr:
        return msgstr

    try:
        dom = lxml.html.fragment_fromstring(msgstr, create_parent=True)
    except Exception:
        return None

    # Find the icon element: must share at least one icon class with old,
    # and if old had data-icon, msgstr's data-icon must match.
    target = None
    for node in dom.iter():
        node_classes, node_attrs = _analyze_icon_node(node)
        if not (node_classes & old_icon_classes):
            continue
        if "data-icon" in old_icon_attrs:
            if node_attrs.get("data-icon") != old_icon_attrs["data-icon"]:
                continue
        target = node
        break

    if target is None:
        return None

    # Rewrite classes: remove old icon classes, add new ones
    for cls in list(target.classes):
        if _is_icon_class(cls):
            target.classes.remove(cls)
    for cls in new_icon_classes:
        target.classes.add(cls)

    # Rewrite icon attributes (e.g. data-icon)
    if "data-icon" in target.attrib:
        del target.attrib["data-icon"]
    for k, v in new_icon_attrs.items():
        target.attrib[k] = v

    return _serialize_dom(dom)


def _print_summary_table(results):
    """Print a summary table of all language results."""
    if not results:
        print(f"\n{Colors.DIM}No changes to report.{Colors.RESET}")
        return

    headers = ["Language", "Updated", "Untranslated", "Warnings"]
    rows = []
    totals = [0, 0, 0]

    for r in results:
        row = [
            r["lang"],
            str(r["updated"]),
            str(r["untranslated"]),
            str(r["warned"]),
        ]
        rows.append(row)
        totals[0] += r["updated"]
        totals[1] += r["untranslated"]
        totals[2] += r["warned"]

    total_row = ["Total", str(totals[0]), str(totals[1]), str(totals[2])]

    # Compute column widths (min width = header length)
    col_widths = [len(h) for h in headers]
    for row in rows + [total_row]:
        for i, cell in enumerate(row):
            col_widths[i] = max(col_widths[i], len(cell))

    def _fmt_row(cells, sep="│ ", pad="│", color=None):
        parts = [pad + " "]
        for i, cell in enumerate(cells):
            parts.append(cell.rjust(col_widths[i]))
            parts.append(f" {sep}" if i < len(cells) - 1 else " " + pad)
        text = "".join(parts)
        return f"{color}{text}{Colors.RESET}" if color else text

    sep_line = "┼".join("─" * (w + 3) for w in col_widths)
    sep_line = f"├{sep_line}┤"
    top_line = "┬".join("─" * (w + 3) for w in col_widths)
    top_line = f"┌{top_line}┐"
    bot_line = "┴".join("─" * (w + 3) for w in col_widths)
    bot_line = f"└{bot_line}┘"

    print(f"\n{top_line}")
    print(_fmt_row(headers, color=Colors.BOLD))
    print(sep_line)
    for row in rows:
        print(_fmt_row(row))
    print(sep_line)
    print(_fmt_row(total_row, color=Colors.BOLD))
    print(bot_line)


def fix_module_translation(module_name, lang=None, dry_run=True):
    i18n_dir = join("./addons", module_name, "i18n")
    potfile = polib.pofile(join(i18n_dir, f"{module_name}.pot"))
    pofiles = [
        polib.pofile(join(i18n_dir, f))
        for f in listdir(i18n_dir)
        if f.endswith(".po")
    ]

    # Build pot candidates: segments with exactly one icon element
    pot_by_sanitized = {}
    for segment in potfile:
        compute_diff(segment)
        if segment.icon_count == 1:
            pot_by_sanitized[segment.sanitized_msgid] = segment

    results = []

    for pofile in pofiles:
        po_lang = pofile.metadata.get("Language", "?")
        if lang and po_lang != lang:
            continue
        modified = False
        counts = {"updated": 0, "untranslated": 0, "warned": 0}

        for po_seg in pofile:
            compute_diff(po_seg)
            if po_seg.icon_count != 1:
                continue

            pot_seg = pot_by_sanitized.get(po_seg.sanitized_msgid)
            if pot_seg is None:
                continue

            # Match found — update msgid to the new pot value.
            new_msgid = pot_seg.msgid

            if not po_seg.msgstr:
                # Untranslated: just update msgid so the entry isn't lost.
                old_icon = _extract_icon_tag(po_seg.msgid)
                new_icon = _extract_icon_tag(new_msgid)
                if dry_run:
                    print(f"\n{Colors.CYAN}WOULD UPDATE msgid: {po_lang}{Colors.RESET}")
                    print(f"  {Colors.DIM}msgid:{Colors.RESET}")
                    print(_format_change(old_icon, new_icon))
                    print(f"  {Colors.DIM}msgstr: (untranslated){Colors.RESET}")
                else:
                    po_seg.msgid = new_msgid
                    modified = True
                counts["untranslated"] += 1
                continue

            new_msgstr = rewrite_msgstr(
                po_seg.msgstr,
                po_seg.icon_classes, po_seg.icon_attrs,
                pot_seg.icon_classes, pot_seg.icon_attrs,
            )

            if new_msgstr is None:
                print(f"\n{Colors.YELLOW}WARN: {po_lang} - Could not patch{Colors.RESET}")
                print(f"  {Colors.RED}⚠ {po_seg.msgid}{Colors.RESET}")
                print(f"  {Colors.RED}⚠ {po_seg.msgstr}{Colors.RESET}")
                counts["warned"] += 1
                continue

            if dry_run:
                old_icon = _extract_icon_tag(po_seg.msgid)
                new_icon = _extract_icon_tag(new_msgid)
                old_translated = _extract_icon_tag(po_seg.msgstr)
                new_translated = _extract_icon_tag(new_msgstr)
                
                print(f"\n{Colors.CYAN}WOULD UPDATE: {po_lang}{Colors.RESET}")
                print(f"  {Colors.DIM}msgid:{Colors.RESET}")
                print(_format_change(old_icon, new_icon))
                print(f"  {Colors.DIM}msgstr:{Colors.RESET}")
                print(_format_change(old_translated, new_translated))
            else:
                po_seg.msgid = new_msgid
                po_seg.msgstr = new_msgstr
                modified = True
            counts["updated"] += 1

        if not dry_run and modified:
            pofile.save()
            print(f"\n{Colors.GREEN}✓ Saved {Colors.BOLD}{po_lang}{Colors.RESET}")

        if counts["updated"] or counts["warned"]:
            results.append({
                "lang": po_lang,
                "updated": counts["updated"],
                "untranslated": counts["untranslated"],
                "warned": counts["warned"],
            })

    _print_summary_table(results)


if __name__ == "__main__":
    parser = ArgumentParser(
        description="Fix translation files after icon migration (fa -> oi)."
    )
    parser.add_argument("module", help="Module name (e.g. sale)")
    parser.add_argument(
        "--lang", help="Process only this language (e.g. fr). If omitted, process all."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write changes to .po files. By default, runs in dry-run mode.",
    )
    args = parser.parse_args()

    fix_module_translation(args.module, lang=args.lang, dry_run=not args.apply)
