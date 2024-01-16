/** @odoo-module */

import { Plugin } from "../plugin";
import { closestElement } from "../utils/dom_traversal";
import { formatSelection } from "../utils/formatting";

const shortcuts = {
    FORMAT_BOLD: (e) => e.key === "b" && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey,
    FORMAT_ITALIC: (e) => e.key === "i" && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey,
    FORMAT_UNDERLINE: (e) => e.key === "u" && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey,
    FORMAT_STRIKETHROUGH: (e) =>
        e.key === "5" && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey,
};

export class FormatPlugin extends Plugin {
    static name = "format";
    setup() {
        this.addDomListener(this.editable, "keydown", this.handleShortcut.bind(this));
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
        const textAlignStyles = new Map();
        for (const element of getTraversedNodes(this.editable)) {
            const block = closestBlock(element);
            if (block.style.textAlign) {
                textAlignStyles.set(block, block.style.textAlign);
            }
        }
        this.document.execCommand("removeFormat");
        for (const node of getTraversedNodes(this.editable)) {
            // The only possible background image on text is the gradient.
            closestElement(node).style.backgroundImage = "";
        }
        for (const block of getTraversedNodes(this.editable)) {
            block.style.setProperty("text-align", textAlign);
        }
    }
    handleShortcut(e) {
        for (const [command, shortcut] of Object.entries(shortcuts)) {
            if (shortcut(e)) {
                e.preventDefault();
                this.dispatch(command);
            }
        }
    }
}
