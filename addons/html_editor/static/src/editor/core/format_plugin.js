/** @odoo-module */

import { Plugin } from "../plugin";
import { formatSelection } from '@html_editor/editor/core/utils';

const shortcuts = {
    FORMAT_BOLD: (e) => e.key === 'b' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey,
    FORMAT_ITALIC: (e) => e.key === 'i' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey,
    FORMAT_UNDERLINE: (e) => e.key === 'u' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey,
    FORMAT_STRIKETHROUGH: (e) => e.key === '5' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey,
}

export class FormatPlugin extends Plugin {
    static name = "format";
    setup() {
        this.addDomListener(this.el, "keydown", this.handleShortcut.bind(this));
    }
    handleCommand(command) {
        switch (command) {
            case "FORMAT_BOLD":
                formatSelection(this.el, "bold");
                break;
            case "FORMAT_ITALIC":
                formatSelection(this.el, "italic");
                break;
            case "FORMAT_UNDERLINE":
                formatSelection(this.el, "underline");
                break;
            case "FORMAT_STRIKETHROUGH":
                formatSelection(this.el, "strikeThrough");
                break;
            case "FORMAT_FONT_SIZE":
                formatSelection(this.el, "fontSize", { applyStyle: true, formatProps: { size: 12 } });
                break;
            case "FORMAT_FONT_SIZE_CLASSNAME":
                formatSelection(this.el, "setFontSizeClassName", { formatProps: { className: "o_default_snippet_text" } });
                break;
            case "FORMAT_REMOVE_FORMAT":
                this.removeFormat();
                break;
        }
    }
    removeFormat() {
        const textAlignStyles = new Map();
        for (const element of getTraversedNodes(this.el)) {
            const block = closestBlock(element);
            if (block.style.textAlign) {
                textAlignStyles.set(block, block.style.textAlign);
            }
        }
        this.config.document.execCommand("removeFormat");
        for (const node of getTraversedNodes(this.el)) {
            // The only possible background image on text is the gradient.
            closestElement(node).style.backgroundImage = "";
        }
        for (const block of getTraversedNodes(this.el)) {
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
