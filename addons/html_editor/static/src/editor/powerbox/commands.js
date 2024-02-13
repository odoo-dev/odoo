import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";

// categories
registry
    .category("powerbox_categories")
    .add("structure", { name: _t("Structure") })
    .add("format", { name: _t("Format") });

registry
    .category("phoenix_commands")
    // 'structure' commands
    .add("bulleted_list", {
        name: _t("Bulleted list"),
        description: _t("Create a simple bulleted list"),
        category: "structure",
        fontawesome: "fa-list-ul",
        action(dispatch) {
            dispatch("TOGGLE_LIST", { mode: "UL" });
        },
    })
    .add("numbered_list", {
        name: _t("Numbered list"),
        description: _t("Create a list with numbering"),
        category: "structure",
        fontawesome: "fa-list-ol",
        action(dispatch) {
            dispatch("TOGGLE_LIST", { mode: "OL" });
        },
    })
    .add("checklist", {
        name: _t("Checklist"),
        description: _t("Track tasks with a checklist"),
        category: "structure",
        fontawesome: "fa-check-square-o",
        action(dispatch) {
            dispatch("TOGGLE_LIST", { mode: "CL" });
        },
    })
    .add("separator", {
        name: _t("Separator"),
        description: _t("Insert a horizontal rule separator"),
        category: "structure",
        fontawesome: "fa-minus",
        action(dispatch) {
            dispatch("INSERT_SEPARATOR");
        },
    })
    .add("columns_2", {
        name: _t("2 columns"),
        description: _t("Convert into 2 columns"),
        category: "structure",
        fontawesome: "fa-columns",
        action(dispatch) {
            dispatch("COLUMNIZE", { numberOfColumns: 2 });
        },
    })
    .add("columns_3", {
        name: _t("3 columns"),
        description: _t("Convert into 3 columns"),
        category: "structure",
        fontawesome: "fa-columns",
        action(dispatch) {
            dispatch("COLUMNIZE", { numberOfColumns: 3 });
        },
    })
    .add("columns_4", {
        name: _t("4 columns"),
        description: _t("Convert into 4 columns"),
        category: "structure",
        fontawesome: "fa-columns",
        action(dispatch) {
            dispatch("COLUMNIZE", { numberOfColumns: 4 });
        },
    })
    .add("columns_remove", {
        name: _t("Remove columns"),
        description: _t("Back to one column"),
        category: "structure",
        fontawesome: "fa-columns",
        action(dispatch) {
            dispatch("COLUMNIZE", { numberOfColumns: 0 });
        },
    })
    // 'format' commands
    .add("heading_1", {
        name: _t("Heading 1"),
        description: _t("Big section heading"),
        category: "format",
        fontawesome: "fa-header",
        action(dispatch) {
            dispatch("SET_TAG", { tagName: "H1" });
        },
    })
    .add("heading_2", {
        name: _t("Heading 2"),
        description: _t("Medium section heading"),
        category: "format",
        fontawesome: "fa-header",
        action(dispatch) {
            dispatch("SET_TAG", { tagName: "H2" });
        },
    })
    .add("heading_3", {
        name: _t("Heading 3"),
        description: _t("Small section heading"),
        category: "format",
        fontawesome: "fa-header",
        action(dispatch) {
            dispatch("SET_TAG", { tagName: "H3" });
        },
    });
