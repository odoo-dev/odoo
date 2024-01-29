/** @odoo-module */

import { registry } from "@web/core/registry";
import { Plugin } from "../plugin";
import { closestBlock, isBlock } from "../utils/blocks";
import { makeContentsInline } from "../utils/dom";
import { splitElement, splitTextNode } from "../utils/dom_split";
import {
    allowsParagraphRelatedElements,
    getDeepestPosition,
    isSelfClosingElement,
    isShrunkBlock,
    isUnbreakable,
} from "../utils/dom_info";
import { closestElement, descendants } from "../utils/dom_traversal";
import { DIRECTIONS, childNodeIndex, rightPos } from "../utils/position";

export class DomPlugin extends Plugin {
    static name = "dom";
    static shared = ["dom_insert", "getEditableSelection"];

    handleCommand(command, payload) {
        switch (command) {
            case "SET_TAG":
                this.setTag(payload);
                break;
            case "INSERT_SEPARATOR":
                this.insertSeparator();
                break;
            case "CLEAN": {
                const root = payload;
                for (const node of [root, ...descendants(root)]) {
                    if (node.classList && !node.classList.length) {
                        node.removeAttribute("class");
                    }
                }
                break;
            }
        }
    }

    // Shared

    dom_insert(content) {
        if (!content) {
            return;
        }
        const selection = this.document.getSelection();
        let startNode;
        let insertBefore = false;
        if (!selection.isCollapsed) {
            this.dispatch("DELETE_RANGE", { selection });
        }
        const range = selection.getRangeAt(0);
        if (range.startContainer.nodeType === Node.TEXT_NODE) {
            insertBefore = !range.startOffset;
            splitTextNode(range.startContainer, range.startOffset, DIRECTIONS.LEFT);
            startNode = range.startContainer;
        }

        const container = document.createElement("fake-element");
        const containerFirstChild = document.createElement("fake-element-fc");
        const containerLastChild = document.createElement("fake-element-lc");

        if (typeof content === "string") {
            container.textContent = content;
        } else {
            container.replaceChildren(content);
        }

        // In case the html inserted starts with a list and will be inserted within
        // a list, unwrap the list elements from the list.
        if (
            closestElement(selection.anchorNode, "UL, OL") &&
            (container.firstChild.nodeName === "UL" || container.firstChild.nodeName === "OL")
        ) {
            container.replaceChildren(...container.firstChild.childNodes);
        }

        startNode = startNode || this.document.getSelection().anchorNode;
        // If the selection anchorNode is the editable itself, the content
        // should not be unwrapped.
        if (selection.anchorNode.oid !== "root") {
            // In case the html inserted is all contained in a single root <p> or <li>
            // tag, we take the all content of the <p> or <li> and avoid inserting the
            // <p> or <li>. The same is true for a <pre> inside a <pre>.
            if (
                container.childElementCount === 1 &&
                (container.firstChild.nodeName === "P" ||
                    container.firstChild.nodeName === "LI" ||
                    (container.firstChild.nodeName === "PRE" && closestElement(startNode, "pre")))
            ) {
                const p = container.firstElementChild;
                container.replaceChildren(...p.childNodes);
            } else if (container.childElementCount > 1) {
                // Grab the content of the first child block and isolate it.
                if (
                    isBlock(container.firstChild) &&
                    !["TABLE", "UL", "OL"].includes(container.firstChild.nodeName)
                ) {
                    containerFirstChild.replaceChildren(...container.firstElementChild.childNodes);
                    container.firstElementChild.remove();
                }
                // Grab the content of the last child block and isolate it.
                if (
                    isBlock(container.lastChild) &&
                    !["TABLE", "UL", "OL"].includes(container.lastChild.nodeName)
                ) {
                    containerLastChild.replaceChildren(...container.lastElementChild.childNodes);
                    container.lastElementChild.remove();
                }
            }
        }

        if (startNode.nodeType === Node.ELEMENT_NODE) {
            if (selection.anchorOffset === 0) {
                const textNode = this.document.createTextNode("");
                if (isSelfClosingElement(startNode)) {
                    startNode.parentNode.insertBefore(textNode, startNode);
                } else {
                    startNode.prepend(textNode);
                }
                startNode = textNode;
            } else {
                startNode = startNode.childNodes[selection.anchorOffset - 1];
            }
        }

        // If we have isolated block content, first we split the current focus
        // element if it's a block then we insert the content in the right places.
        let currentNode = startNode;
        let lastChildNode = false;
        const _insertAt = (reference, nodes, insertBefore) => {
            for (const child of insertBefore ? nodes.reverse() : nodes) {
                reference[insertBefore ? "before" : "after"](child);
                reference = child;
            }
        };
        const lastInsertedNodes = [...containerLastChild.childNodes];
        if (containerLastChild.hasChildNodes()) {
            const toInsert = [...containerLastChild.childNodes]; // Prevent mutation
            _insertAt(currentNode, [...toInsert], insertBefore);
            currentNode = insertBefore ? toInsert[0] : currentNode;
            lastChildNode = toInsert[toInsert.length - 1];
        }
        const firstInsertedNodes = [...containerFirstChild.childNodes];
        if (containerFirstChild.hasChildNodes()) {
            const toInsert = [...containerFirstChild.childNodes]; // Prevent mutation
            _insertAt(currentNode, [...toInsert], insertBefore);
            currentNode = toInsert[toInsert.length - 1];
            insertBefore = false;
        }

        // If all the Html have been isolated, We force a split of the parent element
        // to have the need new line in the final result
        if (!container.hasChildNodes()) {
            if (isUnbreakable(closestBlock(currentNode.nextSibling))) {
                // @todo @phoenix verify it works
                this.dispatch("DOM_SHIFT_ENTER", { element: currentNode.nextSibling, index: 0 });
            } else {
                // If we arrive here, the o_enter index should always be 0.
                const parent = currentNode.nextSibling.parentElement;
                const index = [...parent.childNodes].indexOf(currentNode.nextSibling);
                // @todo @phoenix verify it works
                this.dispatch("DOM_ENTER", { element: currentNode.nextSibling, index });
            }
        }

        let nodeToInsert;
        const insertedNodes = [...container.childNodes];
        while ((nodeToInsert = container.childNodes[0])) {
            if (isBlock(nodeToInsert) && !allowsParagraphRelatedElements(currentNode)) {
                // Split blocks at the edges if inserting new blocks (preventing
                // <p><p>text</p></p> or <li><li>text</li></li> scenarios).
                while (
                    currentNode.parentElement !== this.editable &&
                    (!allowsParagraphRelatedElements(currentNode.parentElement) ||
                        currentNode.parentElement.nodeName === "LI")
                ) {
                    if (isUnbreakable(currentNode.parentElement)) {
                        makeContentsInline(container);
                        nodeToInsert = container.childNodes[0];
                        break;
                    }
                    let offset = childNodeIndex(currentNode);
                    if (!insertBefore) {
                        offset += 1;
                    }
                    if (offset) {
                        const [left, right] = splitElement(currentNode.parentElement, offset);
                        currentNode = insertBefore ? right : left;
                    } else {
                        currentNode = currentNode.parentElement;
                    }
                }
            }
            if (insertBefore) {
                currentNode.before(nodeToInsert);
                insertBefore = false;
            } else {
                currentNode.after(nodeToInsert);
            }
            if (currentNode.tagName !== "BR" && isShrunkBlock(currentNode)) {
                currentNode.remove();
            }
            currentNode = nodeToInsert;
        }
        currentNode = lastChildNode || currentNode;
        selection.removeAllRanges();
        const newRange = new Range();
        let lastPosition = rightPos(currentNode);
        if (lastPosition[0] === this.editable) {
            // Correct the position if it happens to be in the editable root.
            lastPosition = getDeepestPosition(...lastPosition);
        }
        newRange.setStart(lastPosition[0], lastPosition[1]);
        newRange.setEnd(lastPosition[0], lastPosition[1]);
        selection.addRange(newRange);
        return [...firstInsertedNodes, ...insertedNodes, ...lastInsertedNodes];
    }

    getEditableSelection() {
        const selection = this.document.getSelection();
        if (selection.rangeCount === 0) {
            return;
        }
        if (
            this.editable.contains(selection.anchorNode) &&
            (selection.focusNode === selection.anchorNode ||
                this.editable.contains(selection.focusNode))
        ) {
            return selection;
        }
    }

    // --------------------------------------------------------------------------
    // commands
    // --------------------------------------------------------------------------

    setTag({ tagName, extraClass }) {
        const selection = this.document.getSelection();
        const range = selection.getRangeAt(0);
        const node = range.endContainer;
        const offset = range.endOffset;
        const elem = range.endContainer.parentElement;
        const newElem = this.document.createElement(tagName);
        if (extraClass) {
            newElem.classList.add(extraClass);
        }
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
}

registry.category("phoenix_plugins").add(DomPlugin.name, DomPlugin);
