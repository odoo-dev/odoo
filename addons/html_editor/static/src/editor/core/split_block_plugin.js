/** @odoo-module */

import { registry } from "@web/core/registry";
import { Plugin } from "../plugin";
import { isBlock } from "../utils/blocks";
import { fillEmpty, setTagName } from "../utils/dom";
import { isVisible, isVisibleTextNode } from "../utils/dom_info";
import { splitElementUntil, splitTextNode } from "../utils/dom_split";
import { closestElement, descendants, firstLeaf, lastLeaf } from "../utils/dom_traversal";
import { setCursorEnd, setCursorStart } from "../utils/selection";
import { collapseIfZWS } from "../utils/zws";
import { prepareUpdate } from "../utils/dom_state";

export class SplitBlockPlugin extends Plugin {
    static dependencies = ["dom"];
    static name = "split_block";
    static shared = ["splitElementBlock"];

    setup() {
        this.addDomListener(this.editable, "beforeinput", this.onBeforeInput.bind(this));
    }
    handleCommand(command, payload) {
        switch (command) {
            case "SPLIT_BLOCK":
                this.splitBlock();
                break;
        }
    }

    // --------------------------------------------------------------------------
    // commands
    // --------------------------------------------------------------------------
    splitBlock() {
        let selection = this.shared.getEditableSelection();
        if (!selection) {
            return;
        }
        collapseIfZWS(this.editable, selection);
        this.dispatch("DELETE_RANGE");
        selection = this.shared.getEditableSelection();

        const targetNode = selection.anchorNode;
        const targetOffset = selection.anchorOffset;

        this.splitElementBlock({ targetNode, targetOffset });
    }

    splitElementBlock(params) {
        let { targetNode, targetOffset } = params;

        for (const callback of this.registry.category("split_element_block").getAll()) {
            if (callback({ ...params })) {
                return;
            }
        }

        const result = this.splitBlockPRE(targetNode, targetOffset);

        if (result) {
            return;
        }
        if (targetNode.nodeType === Node.TEXT_NODE) {
            targetOffset = splitTextNode(targetNode, targetOffset);
            targetNode = targetNode.parentElement;
        }
        const restore = prepareUpdate(targetNode, targetOffset);

        const listElement = targetNode.nodeName !== "LI" && targetNode.closest("LI > *");
        const elementToSplit = listElement || closestElement(targetNode, (el) => isBlock(el));

        let [beforeElement, afterElement] = splitElementUntil(
            targetNode,
            targetOffset,
            elementToSplit.parentElement
        );
        restore();
        const removeEmptyAndFill = (node) => {
            if (!isBlock(node) && !isVisible(node)) {
                const parent = node.parentElement;
                node.remove();
                removeEmptyAndFill(parent);
            } else {
                fillEmpty(node);
            }
        };
        removeEmptyAndFill(lastLeaf(beforeElement));
        removeEmptyAndFill(firstLeaf(afterElement));

        afterElement = this.splitBlockEndHeading(afterElement) || afterElement;
        setCursorStart(afterElement);

        return afterElement;
    }

    /**
     * Specific behavior for headings: do not split in two if cursor at the end but
     * instead create a paragraph.
     * Cursor end of line: <h1>title[]</h1> + ENTER <=> <h1>title</h1><p>[]<br/></p>
     * Cursor in the line: <h1>tit[]le</h1> + ENTER <=> <h1>tit</h1><h1>[]le</h1>
     */
    splitBlockEndHeading(newElement) {
        if (["H1", "H2", "H3", "H4", "H5", "H6"].includes(newElement.tagName)) {
            if (!descendants(newElement).some(isVisibleTextNode)) {
                const node = setTagName(newElement, "P");
                node.replaceChildren(document.createElement("br"));
                return node;
            }
        }
    }
    /**
     * Specific behavior for pre: insert newline (\n) in text or insert p at
     * end.
     */
    splitBlockPRE(targetNode, offset) {
        if (targetNode.tagName === "PRE") {
            if (offset < targetNode.childNodes.length) {
                const lineBreak = document.createElement("br");
                targetNode.insertBefore(lineBreak, targetNode.childNodes[offset]);
                setCursorEnd(lineBreak);
            } else {
                const node = document.createElement("p");
                targetNode.parentNode.insertBefore(node, targetNode.nextSibling);
                fillEmpty(node);
                setCursorStart(node);
            }
            return true;
        }
    }
    onBeforeInput(e) {
        if (e.inputType === "insertParagraph") {
            e.preventDefault();
            this.splitBlock();
        }
    }
}

registry.category("phoenix_plugins").add(SplitBlockPlugin.name, SplitBlockPlugin);
