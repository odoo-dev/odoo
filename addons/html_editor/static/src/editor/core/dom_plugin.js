/** @odoo-module */

import { Plugin } from "../plugin";

export class DomPlugin extends Plugin {
    static name = "dom";

    handleCommand(command, payload) {
        switch (command) {
            case "SET_TAG":
                this.setTag(payload);
                break;
            case "INSERT_SEPARATOR":
                this.insertSeparator();
                break;
            case "TOGGLE_LIST":
                this.toggleList(payload.type);
                break;
            case "TOGGLE_CHECKLIST":
                this.toggleChecklist();
                break;
        }
    }

    // --------------------------------------------------------------------------
    // commands
    // --------------------------------------------------------------------------

    setTag({ tagName }) {
        const selection = this.document.getSelection();
        const range = selection.getRangeAt(0);
        const node = range.endContainer;
        const offset = range.endOffset;
        const elem = range.endContainer.parentElement;
        const newElem = this.document.createElement(tagName);
        const children = [...elem.childNodes];
        let hasOnlyEmptyTextNodes = true;
        for (const child of children) {
            newElem.appendChild(child);
            if (!(child instanceof Text) || child.nodeValue !== "") {
                hasOnlyEmptyTextNodes = false;
            }
        }
        if (hasOnlyEmptyTextNodes) {
            newElem.appendChild(this.document.createElement("BR"));
        }
        elem.replaceWith(newElem);
        selection.setPosition(node, offset);
    }

    insertSeparator() {
        const selection = this.document.getSelection();
        const range = selection.getRangeAt(0);
        const sep = this.document.createElement("hr");
        const target = range.commonAncestorContainer;
        target.parentElement.before(sep);
    }

    toggleList(type) {
        if (type !== "UL" && type !== "OL") {
            throw new Error(`Invalid list type: ${type}`);
        }
        const selection = this.document.getSelection();
        const range = selection.getRangeAt(0);
        const currentNode = range.endContainer;
        const offset = range.endOffset;
        const elem = currentNode.parentElement;
        const list = this.document.createElement(type);
        const li = this.document.createElement("li");
        list.appendChild(li);
        li.appendChild(currentNode);
        elem.replaceWith(list);
        selection.setPosition(currentNode, offset);
        return list;
    }

    toggleChecklist() {
        const list = this.toggleList("UL");
        list.classList.add("o_checklist");
    }
}
