import { registry } from "@web/core/registry";
import { Plugin } from "../plugin";
import { parseHTML } from "../utils/html";

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

export class ClipboardPlugin extends Plugin {
    static name = "clipboard";
    static dependencies = ["dom"];

    setup() {
        this.addDomListener(this.editable, "paste", this.onPaste);
    }

    /**
     * @param {ClipboardEvent} ev
     */
    onPaste(ev) {
        const types = new Set(ev.clipboardData.types);
        if (types.has("text/html")) {
            const html = ev.clipboardData.getData("text/html");
            this.pasteHtml(html);
        } else if (types.has("text/plain")) {
            const text = ev.clipboardData.getData("text/plain");
            this.pasteText(text);
        }
        ev.preventDefault();
    }

    /**
     * @param {string} text
     */
    pasteText(text) {
        // Replace consecutive spaces by alternating nbsp.
        const modifiedText = text.replace(/( {2,})/g, (match) => {
            let alertnateValue = false;
            return match.replace(/ /g, () => {
                alertnateValue = !alertnateValue;
                const replaceContent = alertnateValue ? "\u00A0" : " ";
                return replaceContent;
            });
        });
        this.shared.domInsert(modifiedText);
    }

    pasteHtml(html) {
        const fragment = parseHTML(this.document, html);
        this.shared.domInsert(fragment);
    }
}

registry.category("phoenix_plugins").add(ClipboardPlugin.name, ClipboardPlugin);
