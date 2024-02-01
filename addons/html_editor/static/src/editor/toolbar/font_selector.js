import { Component } from "@odoo/owl";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { _t } from "@web/core/l10n/translation";
import { closestBlock } from "../utils/blocks";

const fontItems = [
    {
        name: _t("Header 1 Display 1"),
        tagName: "h1",
        extraClass: "display-1",
    },
    // TODO @phoenix use them if showExtendedTextStylesOptions is true
    {
        name: _t("Header 1 Display 2"),
        tagName: "h1",
        extraClass: "display-2",
    },
    {
        name: _t("Header 1 Display 3"),
        tagName: "h1",
        extraClass: "display-3",
    },
    {
        name: _t("Header 1 Display 4"),
        tagName: "h1",
        extraClass: "display-4",
    },
    // ----

    { name: _t("Header 1"), tagName: "h1" },
    { name: _t("Header 2"), tagName: "h2" },
    { name: _t("Header 3"), tagName: "h3" },
    { name: _t("Header 4"), tagName: "h4" },
    { name: _t("Header 5"), tagName: "h5" },
    { name: _t("Header 6"), tagName: "h6" },

    { name: _t("Normal"), tagName: "p" },

    // TODO @phoenix use them if showExtendedTextStylesOptions is true
    {
        name: _t("Light"),
        tagName: "p",
        extraClass: "lead",
    },
    {
        name: _t("Small"),
        tagName: "p",
        extraClass: "small",
    },
    // ----

    { name: _t("Code"), tagName: "pre" },
    { name: _t("Quote"), tagName: "blockquote" },
];

export class FontSelector extends Component {
    static template = "html_editor.FontSelector";
    static props = {
        dispatch: Function,
    };
    static components = { Dropdown, DropdownItem };

    setup() {
        this.items = fontItems;
    }

    get fontName() {
        // TODO @phoenix use dom_plugin getSelection for the iframe
        const anchorNode = window.getSelection().anchorNode;
        const block = closestBlock(anchorNode);
        const tagName = block.tagName.toLowerCase();

        const matchingItems = this.items.filter((item) => {
            return item.tagName === tagName;
        });

        if (!matchingItems.length) {
            return "";
        }

        return (
            matchingItems.find((item) => block.classList.contains(item.extraClass)) ||
            matchingItems[0]
        ).name;
    }

    dispatch(cmd, payload) {
        this.props.dispatch(cmd, payload);
    }
}
