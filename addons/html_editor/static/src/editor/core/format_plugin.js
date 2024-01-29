/** @odoo-module */

import { registry } from "@web/core/registry";
import { Plugin } from "../plugin";
import { closestElement } from "../utils/dom_traversal";
import { formatSelection } from "../utils/formatting";
import { getTraversedNodes } from "../utils/selection";

export class FormatPlugin extends Plugin {
    static name = "format";

    setup() {
        this.registry.category("shortcuts").add("control+b", { command: "FORMAT_BOLD" });
        this.registry.category("shortcuts").add("control+i", { command: "FORMAT_ITALIC" });
        this.registry.category("shortcuts").add("control+u", { command: "FORMAT_UNDERLINE" });
        this.registry.category("shortcuts").add("control+5", { command: "FORMAT_STRIKETHROUGH" });
    }

    handleCommand(command, size) {
        switch (command) {
            case "FORMAT_BOLD":
                formatSelection(this.editable, "bold");
                break;
            case "FORMAT_ITALIC":
                formatSelection(this.editable, "italic");
                break;
            case "FORMAT_UNDERLINE":
                formatSelection(this.editable, "underline");
                break;
            case "FORMAT_STRIKETHROUGH":
                formatSelection(this.editable, "strikeThrough");
                break;
            case "FORMAT_FONT_SIZE":
                formatSelection(this.editable, "fontSize", {
                    applyStyle: true,
                    formatProps: { size },
                });
                break;
            case "FORMAT_FONT_SIZE_CLASSNAME":
                formatSelection(this.editable, "setFontSizeClassName", {
                    formatProps: { className: "o_default_snippet_text" },
                });
                break;
            case "FORMAT_REMOVE_FORMAT":
                this.removeFormat();
                break;
        }
    }
    removeFormat() {
        this.document.execCommand("removeFormat");
        for (const node of getTraversedNodes(this.editable)) {
            // The only possible background image on text is the gradient.
            closestElement(node).style.backgroundImage = "";
        }
    }
}

registry.category("phoenix_plugins").add(FormatPlugin.name, FormatPlugin);
