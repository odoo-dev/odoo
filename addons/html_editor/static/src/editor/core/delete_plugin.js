import { registry } from "@web/core/registry";
import { Plugin } from "../plugin";
import { closestBlock, isBlock } from "../utils/blocks";
import { fillEmpty } from "../utils/dom";
import {
    isEditorTab,
    isEmptyBlock,
    isIconElement,
    isNotEditableNode,
    isSelfClosingElement,
    isShrunkBlock,
    isUnbreakable,
    isUnremovable,
    isVisible,
    isVisibleTextNode,
    isWhitespace,
    isZWS,
    nextLeaf,
    previousLeaf,
} from "../utils/dom_info";
import { getState, isFakeLineBreak, prepareUpdate } from "../utils/dom_state";
import {
    closestElement,
    createDOMPathGenerator,
    descendants,
    firstLeaf,
    getCommonAncestor,
    getFurthestUneditableParent,
    lastLeaf,
} from "../utils/dom_traversal";
import { DIRECTIONS, childNodeIndex, leftPos, nodeSize } from "../utils/position";
import { CTYPES } from "../utils/content_types";

export class DeletePlugin extends Plugin {
    static dependencies = ["selection"];
    static name = "delete";
    static resources = () => ({
        shortcuts: [{ hotkey: "backspace", command: "DELETE_BACKWARD" }],
    });

    setup() {
        this.addDomListener(this.editable, "beforeinput", this.onBeforeInput.bind(this));
    }

    handleCommand(command, payload) {
        switch (command) {
            case "DELETE_BACKWARD":
                this.deleteBackward();
                break;
            case "DELETE_FORWARD":
                this.deleteForward();
                break;
            case "DELETE_RANGE":
                this.deleteRange();
                break;
        }
    }

    // --------------------------------------------------------------------------
    // commands
    // --------------------------------------------------------------------------

    deleteRange() {
        let selection = this.shared.getEditableSelection();
        // @todo @phoenix: handle non-collapsed selection around a ZWS
        // see collapseIfZWS
        if (selection.isCollapsed) {
            return;
        }

        selection = this.deleteRangeAjustSelection(selection);

        const { cursorPos } = this.deleteSelection(selection);

        this.shared.setSelection(cursorPos);
        this.dispatch("ADD_STEP");
    }

    /**
     * @todo @phoenix: rename deleteRange and deleteSelection (invert them?)
     */
    deleteSelection(selection) {
        // Split text nodes in order to have elements as start/end containers.
        const { startElement, startOffset, endElement, endOffset, commonAncestor } =
            this.splitTextNodes(selection);

        const restore = prepareUpdate(startElement, startOffset, endElement, endOffset);

        // Remove nodes.
        const { startRemoveIndex, allNodesRemoved, nRemovedNodes } = this.removeNodes({
            startElement,
            startOffset,
            endElement,
            endOffset,
            commonAncestor,
        });

        // Join fragments if they are part of direct sibling sub-trees under
        // commonAncestor. At least one of the sides must be a fragment.
        let joined;
        if (allNodesRemoved && (startElement !== commonAncestor || endElement !== commonAncestor)) {
            joined = this.joinFragments(startElement, endElement, commonAncestor, startRemoveIndex);
        }

        // Define cursor position: place it on startElement, unless it has been
        // removed by the join.
        let cursorPos;
        if (startElement.isConnected) {
            cursorPos = { anchorNode: startElement, anchorOffset: startOffset };
        } else if (endElement === commonAncestor) {
            cursorPos = { anchorNode: commonAncestor, anchorOffset: startRemoveIndex };
        } else {
            cursorPos = { anchorNode: endElement, anchorOffset: 0 };
        }

        // Fill empty blocks, remove empty inlines.
        this.handleEmptyElements(commonAncestor, cursorPos);

        // Preserve cursor
        // @todo: do this properly
        let cursorNode;
        if (cursorPos.anchorOffset < cursorPos.anchorNode.childNodes.length) {
            cursorNode = cursorPos.anchorNode.childNodes[cursorPos.anchorOffset];
        }

        // Restore spaces state.
        restore();

        // Restore cursor
        if (cursorNode?.isConnected) {
            cursorPos = {
                anchorNode: cursorNode.parentElement,
                anchorOffset: childNodeIndex(cursorNode),
            };
        }
        return { cursorPos, allNodesRemoved, nRemovedNodes, joined };
    }

    /**
     * Splits text nodes and returns the updated container elements and offset values.
     *
     * @returns {Object} start, end and common ancestor elements and offsets
     */
    splitTextNodes({
        startContainer,
        startOffset,
        endContainer,
        endOffset,
        commonAncestorContainer,
    }) {
        // Splits text nodes only if necessary.
        const split = (textNode, offset) => {
            let didSplit = false;
            if (offset === 0) {
                offset = childNodeIndex(textNode);
            } else if (offset === nodeSize(textNode)) {
                offset = childNodeIndex(textNode) + 1;
            } else {
                textNode.splitText(offset);
                didSplit = true;
                offset = childNodeIndex(textNode) + 1;
            }
            return [textNode.parentElement, offset, didSplit];
        };

        if (endContainer.nodeType === Node.TEXT_NODE) {
            [endContainer, endOffset] = split(endContainer, endOffset);
        }
        if (startContainer.nodeType === Node.TEXT_NODE) {
            let didSplit;
            [startContainer, startOffset, didSplit] = split(startContainer, startOffset);
            if (startContainer === endContainer && didSplit) {
                endOffset += 1;
            }
        }
        if (commonAncestorContainer.nodeType === Node.TEXT_NODE) {
            commonAncestorContainer = commonAncestorContainer.parentElement;
        }

        return {
            startElement: startContainer,
            startOffset,
            endElement: endContainer,
            endOffset,
            commonAncestor: commonAncestorContainer,
        };
    }

    removeNodes({ startElement, startOffset, endElement, endOffset, commonAncestor }) {
        // Remove child nodes to the right, propagate until commonAncestor (non-inclusive)
        let node = startElement;
        let startRemoveIndex = startOffset;
        const nodesToRemove = [];
        while (node !== commonAncestor) {
            // @phoenix @todo: handle unremovable nodes
            [...node.childNodes]
                .slice(startRemoveIndex)
                .forEach((child) => nodesToRemove.push(child));
            startRemoveIndex = childNodeIndex(node) + 1;
            node = node.parentElement;
        }

        // Remove child nodes to the left, propagate until commonAncestor (non-inclusive)
        node = endElement;
        let endRemoveIndex = endOffset;
        while (node !== commonAncestor) {
            // @phoenix @todo: handle unremovable nodes
            [...node.childNodes]
                .slice(0, endRemoveIndex)
                .forEach((child) => nodesToRemove.push(child));
            endRemoveIndex = childNodeIndex(node);
            node = node.parentElement;
        }
        // Remove nodes in between subtrees
        for (const node of [...commonAncestor.childNodes].slice(startRemoveIndex, endRemoveIndex)) {
            nodesToRemove.push(node);
        }

        // Remove nodes
        let allNodesRemoved = true;
        let nRemovedNodes = 0;
        for (const node of nodesToRemove) {
            const didRemove = this.removeNode(node);
            allNodesRemoved &&= didRemove;
            nRemovedNodes += Number(didRemove);
        }
        return { startRemoveIndex, allNodesRemoved, nRemovedNodes };
    }

    // Returns true if node was removed, false otherwise.
    removeNode(node) {
        // @todo @phoenix: get list of callbacks from resources
        const handleUnremovable = [
            {
                callback: (node) => {
                    // @todo @phoenix: break unremovable into the concerned plugins
                    // @todo @phoenix: handle contains unremovable
                    if (isUnremovable(node)) {
                        node.replaceChildren();
                        // @todo: not sure about this.
                        fillEmpty(node);
                        return true;
                    }
                },
            },
        ];

        for (const { callback } of handleUnremovable) {
            if (callback(node)) {
                return false;
            }
        }
        node.remove();
        return true;
    }

    joinFragments(left, right, commonAncestor, offset) {
        // Returns closest block whithin ancestor or ancestor's child inline element.
        const getJoinableElement = (node) => {
            let last;
            while (node !== commonAncestor) {
                if (isBlock(node)) {
                    return { element: node, isBlock: true };
                }
                last = node;
                node = node.parentElement;
            }
            return { element: last, isBlock: false };
        };

        const getJoinableLeft = (node) => {
            if (node === commonAncestor) {
                if (!offset) {
                    return null;
                }
                // @todo: rename this key, as it could be a text node
                const element = commonAncestor.childNodes[offset - 1];
                // Only join blocks when they are fragments.
                if (isBlock(element)) {
                    return null;
                }
                return { element, isBlock: false };
            }
            return getJoinableElement(node);
        };

        const getJoinableRight = (node) => {
            if (node === commonAncestor) {
                if (offset === nodeSize(commonAncestor)) {
                    return null;
                }
                const element = commonAncestor.childNodes[offset];
                if (isBlock(element)) {
                    return null;
                }
                return { element, isBlock: false };
            }
            return getJoinableElement(node);
        };

        const joinableLeft = getJoinableLeft(left);
        const joinableRight = getJoinableRight(right);

        if (!joinableLeft || !joinableRight) {
            return false;
        }

        if (joinableLeft.isBlock && joinableRight.isBlock) {
            return this.mergeBlocks(joinableLeft.element, joinableRight.element, commonAncestor);
        }

        if (joinableLeft.isBlock) {
            return this.joinInlineIntoBlock(joinableLeft.element, joinableRight.element);
        }

        if (joinableRight.isBlock) {
            return this.joinBlockIntoInline(joinableLeft.element, joinableRight.element);
        }

        // @todo @phoenix: consider merging inline elements if they are similar.
        // Otherwise, do it on normalize.
    }

    canBeMerged(left, right) {
        return closestElement(left, isUnbreakable) === closestElement(right, isUnbreakable);
    }

    mergeBlocks(left, right, commonAncestor) {
        const clearEmpty = (node) => {
            // @todo @phoenix: consider using a more robust test (like !isVisible)
            while (node !== commonAncestor && !node.childNodes.length) {
                const toRemove = node;
                node = node.parentElement;
                toRemove.remove();
            }
        };

        const removeBlock = (block) => {
            const parent = block.parentElement;
            // @todo @phoenix: mind the unremovables
            block.remove();
            clearEmpty(parent);
            return true;
        };

        // Unmergeable blocks can be removed if left empty.
        if (!isVisible(right)) {
            return removeBlock(right);
        }
        if (!isVisible(left)) {
            return removeBlock(left);
        }

        // Empty blocks can be removed, unless unbreakable/unremovable.
        if (isEmptyBlock(left) && !isUnbreakable(left)) {
            return removeBlock(left);
        }
        if (isEmptyBlock(right) && !isUnbreakable(right)) {
            return removeBlock(right);
        }

        if (!this.canBeMerged(left, right)) {
            return false;
        }

        left.append(...right.childNodes);
        const rightParent = right.parentElement;
        right.remove();
        clearEmpty(rightParent);
        return true;
    }

    joinInlineIntoBlock(leftBlock, rightInline) {
        if (!this.canBeMerged(leftBlock, rightInline)) {
            return false;
        }

        while (rightInline && !isBlock(rightInline)) {
            // @todo @phoenix: what if right is a BR?
            const toAppend = rightInline;
            rightInline = rightInline.nextSibling;
            leftBlock.append(toAppend);
        }
        return true;
    }

    joinBlockIntoInline(leftInline, rightBlock) {
        if (!this.canBeMerged(leftInline, rightBlock)) {
            return false;
        }

        leftInline.after(...rightBlock.childNodes);
        const rightSibling = rightBlock.nextSibling;
        rightBlock.remove();
        if (rightSibling && !isBlock(rightSibling)) {
            rightSibling.before(this.document.createElement("br"));
        }
        return true;
        // @todo @phoenix: clear empty parent blocks.
    }

    // Fill empty blocks
    // Remove empty inline elements, unless cursor is inside it
    handleEmptyElements(commonAncestor, cursorPos) {
        for (const node of [commonAncestor, ...descendants(commonAncestor)].toReversed()) {
            if (node.nodeType !== Node.ELEMENT_NODE) {
                continue;
            }
            if (isBlock(node)) {
                if (isShrunkBlock(node)) {
                    node.appendChild(this.document.createElement("br"));
                }
            } else {
                if (isVisible(node) || isIconElement(node)) {
                    continue;
                }
                if (node === cursorPos.anchorNode) {
                    // @todo @phoenix: shouldn't this be done by a method by the zws plugin?
                    if (!node.hasAttribute("data-oe-zws-empty-inline")) {
                        node.appendChild(this.document.createTextNode("\u200B"));
                        node.setAttribute("data-oe-zws-empty-inline", "");
                    }
                } else {
                    // @todo handle unremovable
                    node.remove();
                }
            }
        }
        const commomAncestorBlock = closestBlock(commonAncestor);
        if (isShrunkBlock(commomAncestorBlock)) {
            commomAncestorBlock.appendChild(this.document.createElement("br"));
        }
    }

    deleteRangeAjustSelection(selection) {
        // Normalize selection (@todo @phoenix: should be offered by selection plugin)
        // Why? To make deleting more predictable and reproduceable.
        // @todo @phoenix: IMO a selection coming from a triple click should not be normalized
        selection = this.shared.setSelection(selection);

        // Expand selection to fully include non-editable nodes.
        selection = this.expandSelectionToIncludeNonEditables(selection);

        // @todo @phoenix: move this responsability to the selection plugin
        // Correct triple click
        selection = this.correctTripleClick(selection);

        return selection;
    }

    // @phoenix @todo: move this to the selection plugin
    // Consider detecting the triple click and changing the selection to
    // standard triple click behavior between browsers.
    // This correction makes no distinction between an actual selection willing
    // to remove a line break and a triple click.
    correctTripleClick(selection) {
        let { startContainer, startOffset, endContainer, endOffset, commonAncestorContainer } =
            selection;
        const endLeaf = firstLeaf(endContainer);
        const beforeEnd = endLeaf.previousSibling;
        if (
            !endOffset &&
            (startContainer !== endContainer || startOffset !== endOffset) &&
            (!beforeEnd ||
                (beforeEnd.nodeType === Node.TEXT_NODE &&
                    !isVisibleTextNode(beforeEnd) &&
                    !isZWS(beforeEnd)))
        ) {
            const previous = previousLeaf(endLeaf, this.editable, true);
            if (previous && closestElement(previous).isContentEditable) {
                [endContainer, endOffset] = [previous, nodeSize(previous)];
                commonAncestorContainer = getCommonAncestor(
                    [startContainer, endContainer],
                    this.editable
                );
            }
        }
        return { ...selection, endContainer, endOffset, commonAncestorContainer };
    }

    // Expand the range to fully include all contentEditable=False elements.
    expandSelectionToIncludeNonEditables(selection) {
        let { startContainer, startOffset, endContainer, endOffset, commonAncestorContainer } =
            selection;
        const startUneditable = getFurthestUneditableParent(
            startContainer,
            commonAncestorContainer
        );
        if (startUneditable) {
            // @todo @phoenix: Review this spec. I suggest this instead (no block merge after removing):
            // startContainer = startUneditable.parentElement;
            // startOffset = childNodeIndex(startUneditable);
            const leaf = previousLeaf(startUneditable);
            if (leaf) {
                [startContainer, startOffset] = [leaf, nodeSize(leaf)];
            } else {
                [startContainer, startOffset] = [commonAncestorContainer, 0];
            }
        }
        const endUneditable = getFurthestUneditableParent(endContainer, commonAncestorContainer);
        if (endUneditable) {
            // @todo @phoenix: Review this spec. I suggest this instead (no block merge after removing):
            // endContainer = endUneditable.parentElement;
            // endOffset = childNodeIndex(endUneditable) + 1;
            const leaf = nextLeaf(endUneditable);
            if (leaf) {
                [endContainer, endOffset] = [leaf, 0];
            } else {
                [endContainer, endOffset] = [
                    commonAncestorContainer,
                    nodeSize(commonAncestorContainer),
                ];
            }
        }
        // @todo: this assumes the common ancestor does not change. Double check this.
        return { ...selection, startContainer, startOffset, endContainer, endOffset };
    }

    // @todo @phoenix: improve this, use cType and all that crazy stuff.
    // This should probably take the char size as parameter.
    isVisibleChar(textNode, offset) {
        const char = String.fromCodePoint(textNode.textContent.codePointAt(offset));
        if (char === "\u200B") {
            return false;
        }
        // @todo @phoenix: for the 2nd condition, consider using `isInPre` instead
        if (!isWhitespace(char) || closestElement(textNode, "PRE")) {
            return true;
        }
        // // if preceded by a whitespace, it's not visible
        if (offset && isWhitespace(textNode.textContent[offset - 1])) {
            return false;
        }
        // if at the beginning of a block, it's not visible
        const leftLeafOnlyNotBlockPath = createDOMPathGenerator(DIRECTIONS.LEFT, {
            leafOnly: true,
            stopTraverseFunction: isBlock,
            stopFunction: isBlock,
        });
        const previousLeafInBlock = leftLeafOnlyNotBlockPath(textNode).next().value;
        if (offset === 0 && !previousLeafInBlock) {
            return false;
        }
        // if at the end of a block, it's not visible
        const rightLeafOnlyNotBlockPath = createDOMPathGenerator(DIRECTIONS.RIGHT, {
            leafOnly: true,
            stopTraverseFunction: isBlock,
            stopFunction: isBlock,
        });
        const nextLeafInBlock = rightLeafOnlyNotBlockPath(textNode).next().value;
        if (offset === nodeSize(textNode) - 1 && !nextLeafInBlock) {
            return false;
        }
        return true;
    }

    findStartPos(endNode, endOffset) {
        // search starts from the char before offset
        const searchInTextNode = (node, offset) => {
            // Mind the surrogate pairs.
            // @todo @phoenix: write tests for chars with size > 1 (emoji, etc.)
            const chars = [...node.textContent.slice(0, offset)].reverse();
            for (const char of chars) {
                offset -= char.length;
                if (this.isVisibleChar(node, offset)) {
                    return offset;
                }
            }
            return null;
        };

        if (endNode.nodeType === Node.TEXT_NODE) {
            const offset = searchInTextNode(endNode, endOffset);
            if (offset !== null) {
                return [endNode, offset];
            }
        }

        const endNodeClosestBlock = closestBlock(endNode);
        // let node = previousLeaf(endNode, this.editable, true);
        // getDeepest position returns [p, index] for a BR (thus, not a leaf)
        // make sure endNode is a leaf
        let node;
        if (endNode.hasChildNodes() && endOffset) {
            node = lastLeaf(endNode.childNodes[endOffset - 1]);
        } else {
            node = previousLeaf(endNode, this.editable);
        }
        while (node) {
            // contenteditable=false
            const closestUneditable = closestElement(node, isNotEditableNode);
            if (closestUneditable) {
                return [closestUneditable.parentElement, childNodeIndex(closestUneditable)];
            }
            // skip invisible text nodes
            //(this is here because of a weird test case in which a text node
            // with whitespaces is between 2 paragraphs... but should it?)
            if (node.nodeType === Node.TEXT_NODE && !isVisibleTextNode(node)) {
                node = previousLeaf(node, this.editable);
                continue;
            }

            // Detect block switch: merge blocks without deleting text.
            if (closestBlock(node) !== endNodeClosestBlock) {
                return [node.parentElement, childNodeIndex(node) + 1];
            }

            // BR, IMG
            if (isSelfClosingElement(node)) {
                if (node.nodeName === "BR" && isFakeLineBreak(node)) {
                    node = previousLeaf(node, this.editable);
                    continue;
                }
                return [node.parentElement, childNodeIndex(node)];
            }
            // font-awesome icons. Already handled as contentEditable=false.
            // const closestEl = closestElement(node);
            // if (isIconElement(closestEl)) {
            //     return [closestEl.parentElement, childNodeIndex(closestEl)];
            // }

            if (node.nodeType === Node.TEXT_NODE) {
                const offset = searchInTextNode(node, nodeSize(node));
                if (offset !== null) {
                    return [node, offset];
                }
            }
            node = previousLeaf(node, this.editable);
        }
        return [null, null];
    }

    deleteBackward() {
        let selection = this.shared.getEditableSelection();
        // Normalize selection
        selection = this.shared.setSelection(selection);

        if (!selection.isCollapsed) {
            return this.deleteRange();
        }

        for (const { callback } of this.resources["handle_delete_backward"]) {
            if (
                callback({ targetNode: selection.anchorNode, targetOffset: selection.anchorOffset })
            ) {
                this.dispatch("ADD_STEP");
                return;
            }
        }

        const { endContainer, endOffset } = selection;
        const [startContainer, startOffset] = this.findStartPos(endContainer, endOffset);
        if (!startContainer) {
            return;
        }
        const commonAncestorContainer = getCommonAncestor(
            [startContainer, endContainer],
            this.editable
        );
        const rangeToDelete = {
            startContainer,
            startOffset,
            endContainer,
            endOffset,
            commonAncestorContainer,
        };
        const { cursorPos, joined, nRemovedNodes } = this.deleteSelection(rangeToDelete);
        if (nRemovedNodes || joined) {
            this.shared.setSelection(cursorPos);
        }
        // @todo @phoenix: check if also needed for deleteForward and deleteRange.
        this.normalize(commonAncestorContainer);

        this.dispatch("ADD_STEP");
    }

    findEndPos(startNode, startOffset) {
        const searchInTextNode = (node, offset) => {
            // Mind the surrogate pairs.
            for (const char of node.textContent.slice(offset)) {
                if (this.isVisibleChar(node, offset)) {
                    return offset + char.length;
                }
                offset += char.length;
            }
            return null;
        };

        let node;
        if (startNode.nodeType === Node.TEXT_NODE) {
            const offset = searchInTextNode(startNode, startOffset);
            if (offset !== null) {
                return [startNode, offset];
            }
            node = nextLeaf(startNode, this.editable);
        } else {
            if (startNode.hasChildNodes() && startOffset < nodeSize(startNode)) {
                node = startNode.childNodes[startOffset];
            } else {
                node = nextLeaf(startNode, this.editable);
            }
        }

        const startNodeClosestBlock = closestBlock(startNode);

        while (node) {
            // contenteditable=false
            const closestUneditable = closestElement(node, isNotEditableNode);
            if (closestUneditable) {
                node = closestUneditable;

                // @todo @phoenix: move this logic to the tab plugin
                if (isEditorTab(node)) {
                    // When deleting an editor tab, we need to ensure it's related
                    // ZWS will deleted as well.
                    // @todo @phoenix: for some reason, there might be more than one ZWS.
                    // Investigate this.
                    let nextSibling = node.nextSibling;
                    while (nextSibling?.nodeType === Node.TEXT_NODE) {
                        node = nextSibling;
                        let index = 0;
                        while (index < nodeSize(node)) {
                            if (node.textContent[index] !== "\u200B") {
                                return [node, index];
                            }
                            index++;
                        }
                        nextSibling = node.nextSibling;
                    }
                }

                return [node.parentElement, childNodeIndex(node) + 1];
            }
            // skip invisible text nodes
            if (node.nodeType === Node.TEXT_NODE && !isVisibleTextNode(node)) {
                node = nextLeaf(node, this.editable);
                continue;
            }

            // Detect block switch: merge blocks without deleting text.
            if (closestBlock(node) !== startNodeClosestBlock) {
                return [node.parentElement, childNodeIndex(node)];
            }

            // BR, IMG
            if (isSelfClosingElement(node)) {
                if (node.nodeName === "BR" && isFakeLineBreak(node)) {
                    node = nextLeaf(node, this.editable);
                    continue;
                }
                return [node.parentElement, childNodeIndex(node) + 1];
            }
            // font-awesome icons. Already handled as contentEditable=false.
            // const closestEl = closestElement(node);
            // if (isIconElement(closestEl)) {
            //     return [closestEl.parentElement, childNodeIndex(closestEl)];
            // }

            if (node.nodeType === Node.TEXT_NODE) {
                const offset = searchInTextNode(node, 0);
                if (offset !== null) {
                    return [node, offset];
                }
            }
            node = nextLeaf(node, this.editable);
        }
        return [null, null];
    }

    deleteForward() {
        let selection = this.shared.getEditableSelection();
        // Normalize selection
        selection = this.shared.setSelection(selection);

        if (!selection.isCollapsed) {
            return this.deleteRange();
        }

        // for (const { callback } of this.resources["handle_delete_forward"]) {
        //     if (
        //         callback({ targetNode: selection.anchorNode, targetOffset: selection.anchorOffset })
        //     ) {
        //         this.dispatch("ADD_STEP");
        //         return;
        //     }
        // }

        const { startContainer, startOffset } = selection;
        const [endContainer, endOffset] = this.findEndPos(startContainer, startOffset);
        if (!endContainer) {
            return;
        }
        const rangeToDelete = {
            startContainer,
            startOffset,
            endContainer,
            endOffset,
            commonAncestorContainer: getCommonAncestor(
                [startContainer, endContainer],
                this.editable
            ),
        };
        const { cursorPos, joined, nRemovedNodes } = this.deleteSelection(rangeToDelete);
        if (nRemovedNodes || joined) {
            this.shared.setSelection(cursorPos);
        }

        this.dispatch("ADD_STEP");
    }

    onBeforeInput(e) {
        if (e.inputType === "deleteContentBackward") {
            e.preventDefault();
            this.deleteBackward();
        } else if (e.inputType === "deleteContentForward") {
            e.preventDefault();
            this.deleteForward();
        }
    }

    // @todo @phoenix: try to merge this with handleEmptyElements
    normalize(root) {
        const nonEmptyBlocks = [root, ...descendants(root)].filter(
            (node) => isBlock(node) && !isEmptyBlock(node)
        );
        for (const block of nonEmptyBlocks) {
            const last = lastLeaf(block);
            if (!(last?.nodeName === "BR")) {
                continue;
            }
            // @todo double-check this
            if (getState(...leftPos(last), DIRECTIONS.LEFT).cType === CTYPES.CONTENT) {
                last.remove();
            }
        }
    }
}
// @todo @phoenix: handle bootstrap columns
// Empty unbreakable blocks should be removed with backspace, with the
// notable exception of Bootstrap columns.

// @todo @phoenix: handle this:
// The first child element of a contenteditable="true" zone which
// itself is contained in a contenteditable="false" zone can not be
// removed if it is paragraph-like.

// @todo @phoenix: handle this:
// When deleting an editor tab, we need to ensure it's related
// ZWS will deleted as well.

/**
 * @todo @phoenix Delete me! (leaving it now for reference)
 * Handle text node deletion for Text.oDeleteForward and Text.oDeleteBackward.
 *
 * @param {string} element
 * @param {int} charSize
 * @param {int} offset
 * @param {DIRECTIONS} direction
 * @param {boolean} alreadyMoved
 */
// function deleteText(element, charSize, offset, direction, propagate) {
//     const parentElement = element.parentElement;
//     // Split around the character where the deletion occurs.
//     const firstSplitOffset = splitTextNode(element, offset);
//     const secondSplitOffset = splitTextNode(parentElement.childNodes[firstSplitOffset], charSize);
//     const middleNode = parentElement.childNodes[firstSplitOffset];

//     // Do remove the character, then restore the state of the surrounding parts.
//     const restore = prepareUpdate(
//         parentElement,
//         firstSplitOffset,
//         parentElement,
//         secondSplitOffset
//     );
//     const isSpace = isWhitespace(middleNode) && !isInPre(middleNode);
//     const isZWS = middleNode.nodeValue === "\u200B";
//     middleNode.remove();
//     restore();

//     // If the removed element was not visible content, propagate the deletion.
//     if (
//         isZWS ||
//         (isSpace && getState(parentElement, firstSplitOffset, direction).cType !== CTYPES.CONTENT)
//     ) {
//         propagate({ targetNode: parentElement, targetOffset: firstSplitOffset });
//         if (isZWS) {
//             fillEmpty(parentElement);
//         }
//         return;
//     }
//     fillEmpty(parentElement);
//     setSelection(parentElement, firstSplitOffset);
// }

registry.category("phoenix_plugins").add(DeletePlugin.name, DeletePlugin);
