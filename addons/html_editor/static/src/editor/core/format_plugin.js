import { registry } from "@web/core/registry";
import { Plugin } from "../plugin";
import { closestElement } from "../utils/dom_traversal";
import { formatSelection, isSelectionFormat } from "../utils/formatting";
import { getTraversedNodes } from "../utils/selection";

function isFormatted(format) {
    return (el, selection) => isSelectionFormat(el, format, selection);
}

export class FormatPlugin extends Plugin {
    static name = "format";
    static resources = () => ({
        shortcuts: [
            { hotkey: "control+b", command: "FORMAT_BOLD" },
            { hotkey: "control+i", command: "FORMAT_ITALIC" },
            { hotkey: "control+u", command: "FORMAT_UNDERLINE" },
            { hotkey: "control+5", command: "FORMAT_STRIKETHROUGH" },
        ],
        toolbarGroup: {
            id: "decoration",
            sequence: 20,
            buttons: [
                {
                    id: "bold",
                    cmd: "FORMAT_BOLD",
                    icon: "fa-bold",
                    name: "Toggle bold",
                    isFormatApplied: isFormatted("bold"),
                },
                {
                    id: "italic",
                    cmd: "FORMAT_ITALIC",
                    icon: "fa-italic",
                    name: "Toggle italic",
                    isFormatApplied: isFormatted("italic"),
                },
                {
                    id: "underline",
                    cmd: "FORMAT_UNDERLINE",
                    icon: "fa-underline",
                    name: "Toggle underline",
                    isFormatApplied: isFormatted("underline"),
                },
                {
                    id: "strikethrough",
                    cmd: "FORMAT_STRIKETHROUGH",
                    icon: "fa-strikethrough",
                    name: "Toggle strikethrough",
                    isFormatApplied: isFormatted("strikeThrough"),
                },
            ],
        },
    });

    handleCommand(command, payload) {
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
                    formatProps: { size: payload.size },
                });
                break;
            case "FORMAT_FONT_SIZE_CLASSNAME":
                formatSelection(this.editable, "setFontSizeClassName", {
                    formatProps: { className: payload.className },
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
