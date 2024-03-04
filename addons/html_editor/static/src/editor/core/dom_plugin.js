import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { Plugin } from "../plugin";
import { closestBlock, isBlock } from "../utils/blocks";
import { makeContentsInline, moveNodes, setTagName } from "../utils/dom";
import {
    allowsParagraphRelatedElements,
    areSimilarElements,
    getDeepestPosition,
    isEditorTab,
    isSelfClosingElement,
    isShrunkBlock,
    isUnbreakable,
} from "../utils/dom_info";
import { splitElement, splitTextNode } from "../utils/dom_split";
import { closestElement, descendants, firstLeaf, lastLeaf } from "../utils/dom_traversal";
import { FONT_SIZE_CLASSES, TEXT_STYLE_CLASSES } from "../utils/formatting";
import { DIRECTIONS, childNodeIndex, rightPos, startPos } from "../utils/position";
import { getDeepRange, getTraversedNodes } from "../utils/selection";

export class DomPlugin extends Plugin {
    static name = "dom";
    static dependencies = ["selection"];
    static shared = ["domInsert"];
    static resources = () => ({
        powerboxCommands: {
            name: _t("Separator"),
            description: _t("Insert a horizontal rule separator"),
            category: "structure",
            fontawesome: "fa-minus",
            action(dispatch) {
                dispatch("INSERT_SEPARATOR");
            },
        },
    });

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
            case "NORMALIZE": {
                this.mergeAdjacentNodes(payload.node);
                break;
            }
        }
    }

    // Shared

    /**
     * @param {string | DocumentFragment | null} content
     */
    domInsert(content) {
        if (!content) {
            return;
        }
        let selection = this.shared.getEditableSelection();
        let startNode;
        let insertBefore = false;
        if (!selection.isCollapsed) {
            this.dispatch("DELETE_RANGE", { selection });
            selection = this.shared.getEditableSelection();
        }
        if (selection.startContainer.nodeType === Node.TEXT_NODE) {
            insertBefore = !selection.startOffset;
            splitTextNode(selection.startContainer, selection.startOffset, DIRECTIONS.LEFT);
            startNode = selection.startContainer;
        }

        const container = this.document.createElement("fake-element");
        const containerFirstChild = this.document.createElement("fake-element-fc");
        const containerLastChild = this.document.createElement("fake-element-lc");

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

        startNode = startNode || this.shared.getEditableSelection().anchorNode;
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
        let lastPosition = rightPos(currentNode);
        if (lastPosition[0] === this.editable) {
            // Correct the position if it happens to be in the editable root.
            lastPosition = getDeepestPosition(...lastPosition);
        }
        this.shared.setSelection({ anchorNode: lastPosition[0], anchorOffset: lastPosition[1] });
        return [...firstInsertedNodes, ...insertedNodes, ...lastInsertedNodes];
    }

    // --------------------------------------------------------------------------
    // commands
    // --------------------------------------------------------------------------

    setTag({ tagName, extraClass = "" }) {
        tagName = tagName.toUpperCase();
        const range = getDeepRange(this.editable, { correctTripleClick: true });
        const selectedBlocks = [
            ...new Set(getTraversedNodes(this.editable, range).map(closestBlock)),
        ];
        const deepestSelectedBlocks = selectedBlocks.filter(
            (block) =>
                !descendants(block).some((descendant) => selectedBlocks.includes(descendant)) &&
                block.isContentEditable
        );
        const [startContainer, startOffset, endContainer, endOffset] = [
            firstLeaf(range.startContainer),
            range.startOffset,
            lastLeaf(range.endContainer),
            range.endOffset,
        ];
        for (const block of deepestSelectedBlocks) {
            if (
                ["P", "PRE", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "BLOCKQUOTE"].includes(
                    block.nodeName
                )
            ) {
                if (tagName === "P") {
                    if (block.nodeName === "LI") {
                        continue;
                    } else if (block.parentNode.nodeName === "LI") {
                        block.before(...block.childNodes);
                        block.remove();
                        continue;
                    }
                }

                const newEl = setTagName(block, tagName);
                newEl.classList.remove(
                    ...FONT_SIZE_CLASSES,
                    ...TEXT_STYLE_CLASSES,
                    // We want to be able to edit the case `<h2 class="h3">`
                    // but in that case, we want to display "Header 2" and
                    // not "Header 3" as it is more important to display
                    // the semantic tag being used (especially for h1 ones).
                    // This is why those are not in `TEXT_STYLE_CLASSES`.
                    "h1",
                    "h2",
                    "h3",
                    "h4",
                    "h5",
                    "h6"
                );
                delete newEl.style.fontSize;
                if (extraClass) {
                    newEl.classList.add(extraClass);
                }
                if (newEl.classList.length === 0) {
                    newEl.removeAttribute("class");
                }
            } else {
                // eg do not change a <div> into a h1: insert the h1
                // into it instead.
                const newBlock = this.document.createElement(tagName);
                const children = [...block.childNodes];
                block.insertBefore(newBlock, block.firstChild);
                children.forEach((child) => newBlock.appendChild(child));
            }
        }
        const newRange = new Range();
        newRange.setStart(startContainer, startOffset);
        newRange.setEnd(endContainer, endOffset);
        getDeepRange(this.editable, { range: newRange, select: true });
        this.dispatch("ADD_STEP");
    }

    insertSeparator() {
        const selection = this.shared.getEditableSelection();
        const sep = this.document.createElement("hr");
        const target = selection.commonAncestorContainer;
        target.parentElement.before(sep);
    }

    mergeAdjacentNodes(node) {
        this.mergeAdjacentNode(node);
        for (const child of node.childNodes) {
            this.mergeAdjacentNodes(child);
        }
    }

    mergeAdjacentNode(node) {
        if (
            areSimilarElements(node, node.previousSibling) &&
            !isUnbreakable(node) &&
            !isEditorTab(node) &&
            !(
                node.attributes?.length === 1 &&
                node.hasAttribute("data-oe-zws-empty-inline") &&
                (node.textContent === "\u200B" || node.previousSibling.textContent === "\u200B")
            )
        ) {
            const selection = this.shared.getEditableSelection();
            const [anchorNode, anchorOffset] = getDeepestPosition(
                selection.anchorNode,
                selection.anchorOffset
            );
            const [focusNode, focusOffset] = getDeepestPosition(
                selection.focusNode,
                selection.focusOffset
            );
            // Merge identical elements together.
            moveNodes(...startPos(node), node.previousSibling);
            this.shared.setSelection({ anchorNode, anchorOffset, focusNode, focusOffset });
        }
    }
}

registry.category("phoenix_plugins").add(DomPlugin.name, DomPlugin);
