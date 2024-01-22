/** @odoo-module */

export const CLIPBOARD_WHITELISTS = {
    nodes: [
        // Style
        "P",
        "H1",
        "H2",
        "H3",
        "H4",
        "H5",
        "H6",
        "BLOCKQUOTE",
        "PRE",
        // List
        "UL",
        "OL",
        "LI",
        // Inline style
        "I",
        "B",
        "U",
        "S",
        "EM",
        "FONT",
        "STRONG",
        // Table
        "TABLE",
        "THEAD",
        "TH",
        "TBODY",
        "TR",
        "TD",
        // Miscellaneous
        "IMG",
        "BR",
        "A",
        ".fa",
    ],
    classes: [
        // Media
        /^float-/,
        "d-block",
        "mx-auto",
        "img-fluid",
        "img-thumbnail",
        "rounded",
        "rounded-circle",
        "table",
        "table-bordered",
        /^padding-/,
        /^shadow/,
        // Odoo colors
        /^text-o-/,
        /^bg-o-/,
        // Odoo lists
        "o_checked",
        "o_checklist",
        "oe-nested",
        // Miscellaneous
        /^btn/,
        /^fa/,
    ],
    attributes: ["class", "href", "src", "target"],
    styledTags: ["SPAN", "B", "STRONG", "I", "S", "U", "FONT", "TD"],
};
