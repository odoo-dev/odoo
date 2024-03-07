import { registry } from "@web/core/registry";
import { Plugin } from "../plugin";
import { closestBlock, isBlock } from "../utils/blocks";
import { fillEmpty } from "../utils/dom";
import {
    isEmpty,
    isEmptyBlock,
    isIconElement,
    isInPre,
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
    descendants,
    firstLeaf,
    getCommonAncestor,
    getFurthestUneditableParent,
    lastLeaf,
} from "../utils/dom_traversal";
import { DIRECTIONS, childNodeIndex, leftPos, nodeSize, rightPos } from "../utils/position";
import { CTYPES } from "../utils/content_types";

export class DeletePlugin extends Plugin {
    static dependencies = ["selection"];
    static name = "delete";
    static resources = (p) => ({
        shortcuts: [{ hotkey: "backspace", command: "DELETE_BACKWARD" }],
        handle_delete_backward: { callback: p.deleteBackwardContentEditableFalse.bind(p) },
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
                // @todo @phoenix: consider renaming the command name
                this.deleteSelection();
                break;
        }
    }

    // --------------------------------------------------------------------------
    // commands
    // --------------------------------------------------------------------------

    deleteSelection() {
        const selection = this.shared.getEditableSelection();
        // @todo @phoenix: handle non-collapsed selection around a ZWS
        // see collapseIfZWS
        if (selection.isCollapsed) {
            return;
        }

        const range = this.adjustRangeForDeletion(selection);

        const { cursorPos } = this.deleteRange(range);

        this.shared.setSelection(cursorPos);
    }

    deleteBackward() {
        let selection = this.shared.getEditableSelection();
        // Normalize selection
        selection = this.shared.setSelection(selection);

        if (!selection.isCollapsed) {
            return this.deleteSelection();
        }

        const { endContainer, endOffset } = selection;
        const [startContainer, startOffset] = this.findPreviousPosition(endContainer, endOffset);
        const range = { startContainer, startOffset, endContainer, endOffset };

        for (const { callback } of this.resources["handle_delete_backward"]) {
            if (callback(range)) {
                this.dispatch("ADD_STEP");
                return;
            }
        }
        if (!startContainer) {
            return;
        }
        const { cursorPos, joined, nRemovedNodes, commonAncestor } = this.deleteRange(range);

        if (nRemovedNodes || joined) {
            this.shared.setSelection(cursorPos);
        }

        this.cleanTrailingBRs(commonAncestor);

        this.dispatch("ADD_STEP");
    }

    deleteForward() {
        let selection = this.shared.getEditableSelection();
        // Normalize selection
        selection = this.shared.setSelection(selection);

        if (!selection.isCollapsed) {
            return this.deleteSelection();
        }

        const { startContainer, startOffset } = selection;
        const [endContainer, endOffset] = this.findNextPosition(startContainer, startOffset);
        if (!endContainer) {
            return;
        }
        const range = { startContainer, startOffset, endContainer, endOffset };

        for (const { callback } of this.resources["handle_delete_forward"]) {
            if (callback({ range, deleteRange: this.deleteRange.bind(this) })) {
                this.dispatch("ADD_STEP");
                return;
            }
        }

        const { cursorPos } = this.deleteRange(range);

        this.shared.setSelection(cursorPos);

        this.dispatch("ADD_STEP");
    }

    deleteRange(range) {
        // Split text nodes in order to have elements as start/end containers.
        const { startElement, startOffset, endElement, endOffset } = this.splitTextNodes(range);
        const commonAncestor = getCommonAncestor([startElement, endElement], this.editable);

        const restoreSpaces = prepareUpdate(startElement, startOffset, endElement, endOffset);

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

        const restoreCursor = this.preserveCursor(cursorPos);
        restoreSpaces();
        cursorPos = restoreCursor();

        return { cursorPos, nRemovedNodes, joined, commonAncestor };
    }

    // @phoenix @todo: do this properly
    preserveCursor({ anchorNode, anchorOffset }) {
        let cursorNode;
        if (anchorOffset < nodeSize(anchorNode)) {
            cursorNode = anchorNode.childNodes[anchorOffset];
        }
        return () => {
            if (!cursorNode?.isConnected) {
                // Fallback to original position
                return { anchorNode, anchorOffset };
            }
            return {
                anchorNode: cursorNode.parentElement,
                anchorOffset: childNodeIndex(cursorNode),
            };
        };
    }

    splitTextNodes({ startContainer, startOffset, endContainer, endOffset }) {
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

        return {
            startElement: startContainer,
            startOffset,
            endElement: endContainer,
            endOffset,
        };
    }

    removeNodes({ startElement, startOffset, endElement, endOffset, commonAncestor }) {
        // Remove child nodes to the right, propagate until commonAncestor (non-inclusive)
        let node = startElement;
        let startRemoveIndex = startOffset;
        const nodesToRemove = [];
        while (node !== commonAncestor) {
            for (const child of [...node.childNodes].slice(startRemoveIndex)) {
                nodesToRemove.push(child);
            }
            startRemoveIndex = childNodeIndex(node) + 1;
            node = node.parentElement;
        }

        // Remove child nodes to the left, propagate until commonAncestor (non-inclusive)
        node = endElement;
        let endRemoveIndex = endOffset;
        while (node !== commonAncestor) {
            for (const child of [...node.childNodes].slice(0, endRemoveIndex)) {
                nodesToRemove.push(child);
            }
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

    // @todo @phoenix: document this, factor out inner functions
    joinFragments(left, right, commonAncestor, offset) {
        // Returns closest block whithin ancestor or ancestor's child inline element.
        const getJoinableElement = (element) => {
            let last;
            while (element !== commonAncestor) {
                if (isBlock(element)) {
                    return { node: element, isBlock: true };
                }
                last = element;
                element = element.parentElement;
            }
            return { node: last, isBlock: false };
        };

        const getJoinableLeft = (element) => {
            if (element === commonAncestor) {
                if (!offset) {
                    return null;
                }
                const node = commonAncestor.childNodes[offset - 1];
                // Only join blocks when they are fragments. A direct child of
                // the common ancestor is not a fragment.
                if (isBlock(node)) {
                    return null;
                }
                return { node, isBlock: false };
            }
            return getJoinableElement(element);
        };

        const getJoinableRight = (element) => {
            if (element === commonAncestor) {
                if (offset === nodeSize(commonAncestor)) {
                    return null;
                }
                const node = commonAncestor.childNodes[offset];
                // Only join blocks when they are fragments. A direct child of
                // the common ancestor is not a fragment.
                if (isBlock(node)) {
                    return null;
                }
                return { node, isBlock: false };
            }
            return getJoinableElement(element);
        };

        const joinableLeft = getJoinableLeft(left);
        const joinableRight = getJoinableRight(right);

        if (!joinableLeft || !joinableRight) {
            return false;
        }

        if (joinableLeft.isBlock && joinableRight.isBlock) {
            return this.mergeBlocks(joinableLeft.node, joinableRight.node, commonAncestor);
        }

        if (joinableLeft.isBlock) {
            return this.joinInlineIntoBlock(joinableLeft.node, joinableRight.node);
        }

        if (joinableRight.isBlock) {
            return this.joinBlockIntoInline(joinableLeft.node, joinableRight.node);
        }
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

    adjustRangeForDeletion(selection) {
        // Normalize selection (@todo @phoenix: should be offered by selection plugin)
        // Why? To make deleting more predictable and reproduceable.
        // @todo @phoenix: IMO a selection coming from a triple click should not be normalized
        selection = this.shared.setSelection(selection);

        let range = this.expandSelectionToIncludeNonEditables(selection);

        // @todo @phoenix: move this responsability to the selection plugin
        // Correct triple click
        range = this.correctTripleClick(range);

        return range;
    }

    // @phoenix @todo: move this to the selection plugin
    // Consider detecting the triple click and changing the selection to
    // standard triple click behavior between browsers.
    // This correction makes no distinction between an actual selection willing
    // to remove a line break and a triple click.
    correctTripleClick(range) {
        let { startContainer, startOffset, endContainer, endOffset } = range;
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
            }
        }
        return { ...range, endContainer, endOffset };
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
        return { startContainer, startOffset, endContainer, endOffset };
    }

    // @todo @phoenix: there are not enough tests for visibility of characters
    // (invisible whitespace, separate nodes, etc.)
    isVisibleChar(char, textNode, offset) {
        // ZWS is invisible.
        if (char === "\u200B") {
            return false;
        }
        if (!isWhitespace(char) || isInPre(textNode)) {
            return true;
        }

        // Assess visibility of whitespace.
        // Whitespace is visible if it's immediately preceded by content, and
        // followed by content before a BR or block start/end.

        // If not preceded by content, it is invisible.
        if (offset) {
            if (isWhitespace(textNode.textContent[offset - char.length])) {
                return false;
            }
        } else if (!(getState(...leftPos(textNode), DIRECTIONS.LEFT).cType & CTYPES.CONTENT)) {
            return false;
        }

        // Space is only visible if it's followed by content (with an optional
        // sequence of invisible spaces in between), before a BR or block
        // end/start.
        const charsToTheRight = textNode.textContent.slice(offset + char.length);
        for (char of charsToTheRight) {
            if (!isWhitespace(char)) {
                return true;
            }
        }
        // No content found in text node, look to the right of it
        if (getState(...rightPos(textNode), DIRECTIONS.RIGHT).cType & CTYPES.CONTENT) {
            return true;
        }

        return false;
    }

    shouldSkip(leaf, blockSwitch) {
        if (leaf.nodeType === Node.TEXT_NODE) {
            return false;
        }
        // @todo Maybe skip anything that is not an element (e.g. comment nodes)
        if (blockSwitch) {
            return false;
        }
        if (leaf.nodeName === "BR" && isFakeLineBreak(leaf)) {
            return true;
        }
        if (isSelfClosingElement(leaf)) {
            return false;
        }
        if (isEmpty(leaf) || isZWS(leaf)) {
            return true;
        }
        return false;
    }

    // Returns the previous visible position (ex: a previous character, the end
    // of the previous block, etc.).
    findPreviousPosition(node, offset, blockSwitch = false) {
        // Look for a visible character in text node.
        if (node.nodeType === Node.TEXT_NODE) {
            // @todo @phoenix: write tests for chars with size > 1 (emoji, etc.)
            // Use the string iterator to handle surrogate pairs.
            let index = offset;
            const chars = node.textContent.slice(0, index);
            for (const char of [...chars].reverse()) {
                index -= char.length;
                if (this.isVisibleChar(char, node, index)) {
                    index += blockSwitch ? char.length : 0;
                    return [node, index];
                }
            }
        }

        // Get previous leaf
        let leaf;
        if (node.hasChildNodes() && offset) {
            leaf = lastLeaf(node.childNodes[offset - 1]);
        } else {
            leaf = previousLeaf(node, this.editable);
        }
        if (!leaf) {
            return [null, null];
        }
        // Skip invisible leafs, keeping track whether a block switch occurred.
        const endNodeClosestBlock = closestBlock(node);
        blockSwitch ||= closestBlock(leaf) !== endNodeClosestBlock;
        while (this.shouldSkip(leaf, blockSwitch)) {
            leaf = previousLeaf(leaf, this.editable);
            if (!leaf) {
                return [null, null];
            }
            blockSwitch ||= closestBlock(leaf) !== endNodeClosestBlock;
        }

        // If part of a contenteditable=false tree, expand selection to delete the root.
        const closestUneditable = closestElement(leaf, isNotEditableNode);
        if (closestUneditable) {
            return [closestUneditable.parentElement, childNodeIndex(closestUneditable)];
        }

        if (leaf.nodeType === Node.ELEMENT_NODE) {
            return [leaf.parentElement, childNodeIndex(leaf) + (blockSwitch ? 1 : 0)];
        }

        return this.findPreviousPosition(leaf, nodeSize(leaf), blockSwitch);
    }

    findNextPosition(node, offset, blockSwitch = false) {
        // Look for a visible character in text node.
        if (node.nodeType === Node.TEXT_NODE) {
            // Use the string iterator to handle surrogate pairs.
            let index = offset;
            for (const char of node.textContent.slice(index)) {
                if (this.isVisibleChar(char, node, index)) {
                    index += blockSwitch ? 0 : char.length;
                    return [node, index];
                }
                index += char.length;
            }
        }

        // Get next leaf
        let leaf;
        if (node.hasChildNodes() && offset < nodeSize(node)) {
            leaf = firstLeaf(node.childNodes[offset]);
        } else {
            leaf = nextLeaf(node, this.editable);
        }
        if (!leaf) {
            return [null, null];
        }
        // Skip invisible leafs, keeping track whether a block switch occurred.
        const startNodeClosestBlock = closestBlock(node);
        blockSwitch ||= closestBlock(leaf) !== startNodeClosestBlock;
        while (this.shouldSkip(leaf, blockSwitch)) {
            leaf = nextLeaf(leaf, this.editable);
            if (!leaf) {
                return [null, null];
            }
            blockSwitch ||= closestBlock(leaf) !== startNodeClosestBlock;
        }

        // If part of a contenteditable=false tree, expand selection to delete the root.
        const closestUneditable = closestElement(leaf, isNotEditableNode);
        if (closestUneditable) {
            return [closestUneditable.parentElement, childNodeIndex(closestUneditable) + 1];
        }

        if (leaf.nodeType === Node.ELEMENT_NODE) {
            return [leaf.parentElement, childNodeIndex(leaf) + (blockSwitch ? 0 : 1)];
        }

        return this.findNextPosition(leaf, 0, blockSwitch);
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

    // ======== AD-HOC STUFF ========

    // This is only needed because of one test case in which an invisible
    // trailing BR would be left otherwise:
    // "should delete an empty paragraph in a table cell"
    // Reconsider this. Maybe this should be done on NORMALIZE, but a few tests would
    // need to be adapted.
    /**
     * Removes BRs that have no visible effect: <p>content<br></p> -> <p>content</p>
     *
     * @param {Element} root
     */
    cleanTrailingBRs(root) {
        for (const br of root.querySelectorAll("br")) {
            if (
                getState(...leftPos(br), DIRECTIONS.LEFT).cType & CTYPES.CONTENT &&
                getState(...rightPos(br), DIRECTIONS.RIGHT).cType & CTYPES.BLOCK_INSIDE &&
                // @todo @phoenix: the condition below is only here because of this test case:
                // "should delete star rating elements when delete is pressed twice"
                // as a ZWS matches CTYPES.CONTENT
                !isEmptyBlock(closestBlock(br))
            ) {
                br.remove();
            }
        }
    }

    // This a satisfies a weird spec in which the cursor should not move after
    // the deletion of contenteditable=false elements. This might not be
    // necessary if the selection normalization is improved.
    deleteBackwardContentEditableFalse(range) {
        const { startContainer, startOffset } = range;
        if (!(startContainer?.nodeType === Node.ELEMENT_NODE)) {
            return false;
        }
        const node = startContainer.childNodes[startOffset];
        if (!node || node.nodeType !== Node.ELEMENT_NODE) {
            return false;
        }
        if (isNotEditableNode(node)) {
            this.deleteRange(range);
            // The only difference: do not change the selection
            return true;
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

registry.category("phoenix_plugins").add(DeletePlugin.name, DeletePlugin);
