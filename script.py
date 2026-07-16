from os import listdir
from os.path import join

import lxml.html
import polib


def compute_diff(segment):
    dom = lxml.html.fragment_fromstring(segment.msgid, create_parent=True)

    diffs = []

    for node in dom.iter():
        # remove fontawesome and material icon classes
        classes_to_remove = [
            c
            for c in node.classes
            if c == "fa" or c == "oi" or c.startswith(("oi-", "fa-"))
        ]
        for cls in classes_to_remove:
            node.classes.remove(cls)
            diffs.append(("remove", "class", cls))

        # remove data-icon attributes
        if 'data-icon' in node.attrib:
            diffs.append(("remove", "data-icon", node.attrib['data-icon']))
            del node.attrib['data-icon']

    segment.sanitized_msgid = "".join(
        str(lxml.html.tostring(child, encoding="unicode")) for child in dom
    )
    segment.diffs = diffs

    return segment


def fix_module_translation(module_name):
    potfile = polib.pofile(join("./addons", module_name, "i18n", f"{module_name}.pot"))
    pofiles = [polib.pofile(join("./addons", module_name, "i18n", f)) for f in listdir(join("./addons", module_name, "i18n")) if f.endswith(".po")]

    pot_segments_with_diffs = [compute_diff(segment) for segment in potfile if "oi " in segment.msgid]
    pot_sanitized_msgids = {segment.sanitized_msgid for segment in pot_segments_with_diffs}

    for pofile in pofiles:
        po_segments_with_diffs = [compute_diff(segment) for segment in pofile if "fa " in segment.msgid]

        common_segments = [
            po_segment
            for po_segment in po_segments_with_diffs
            if po_segment.sanitized_msgid in pot_sanitized_msgids
        ]

        print(pofile.metadata.get('Language'))
        print("===============================")
        print(common_segments)
        print("\n\n\n")


fix_module_translation("sale")

# get all pot files
# get segments with oi
# for each po file in the same directory, check if there is safe candidate
