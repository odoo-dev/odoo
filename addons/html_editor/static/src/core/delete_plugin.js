import { Plugin } from "../plugin";
import { closestBlock, isBlock } from "../utils/blocks";
import {
    isEmpty,
    isEmptyBlock,
    isIconElement,
    isInPre,
    isNotEditableNode,
    isSelfClosingElement,
    isShrunkBlock,
    isUnbreakable,
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
    static shared = ["deleteRange"];
    static resources = (p) => ({
        shortcuts: [
            { hotkey: "backspace", command: "DELETE_BACKWARD" },
            { hotkey: "delete", command: "DELETE_FORWARD" },
        ],
        handle_delete_backward: [
            { callback: p.deleteBackwardContentEditableFalse.bind(p) },
            { callback: p.deleteBackwardUnmergeable.bind(p) },
        ],
        handle_delete_forward: { callback: p.deleteForwardUnmergeable.bind(p) },
        // @todo @phoenix: move these predicates to different plugins
        unremovables: [
            // The root editable (@todo @phoenix: I don't think this is necessary)
            (element) => element.classList.contains("odoo-editor-editable"),
            // Website stuff?
            (element) => element.classList.contains("o_editable"),
            (element) => element.classList.contains("oe_unremovable"),
            // QWeb directives
            (element) => element.getAttribute("t-set") || element.getAttribute("t-call"),
            // Monetary field
            (element) => element.matches("[data-oe-type='monetary'] > span"),
        ],
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

    deleteSelection(selection = this.shared.getEditableSelection()) {
        // @todo @phoenix: handle non-collapsed selection around a ZWS
        // see collapseIfZWS
        if (selection.isCollapsed) {
            return;
        }

        const range = this.adjustRangeForDeletion(selection);

        for (const { callback } of this.resources["handle_delete_range"]) {
            if (callback(range)) {
                return;
            }
        }

        const { cursorPos } = this.deleteRange(range);

        this.shared.setSelection(cursorPos);
    }

    deleteBackward() {
        const selection = this.shared.getEditableSelection();

        if (selection.isCollapsed) {
            this.deleteBackwardChar(selection);
        } else {
            this.deleteSelection(selection);
        }

        this.dispatch("ADD_STEP");
    }

    deleteForward() {
        const selection = this.shared.getEditableSelection();

        if (selection.isCollapsed) {
            this.deleteForwardChar(selection);
        } else {
            this.deleteSelection(selection);
        }

        this.dispatch("ADD_STEP");
    }

    // Big @todo @phoenix: delete backward word (ctrl + delete)
    deleteBackwardChar(selection) {
        // Normalize selection
        selection = this.shared.setSelection(selection);

        const { endContainer, endOffset } = selection;
        const [startContainer, startOffset] = this.findPreviousPosition(endContainer, endOffset);
        const range = { startContainer, startOffset, endContainer, endOffset };

        for (const { callback } of this.resources["handle_delete_backward"]) {
            if (callback(range)) {
                return;
            }
        }
        if (!startContainer) {
            return;
        }
        const { cursorPos, joined, anyNodesRemoved, commonAncestor } = this.deleteRange(range);

        // @todo @phoenix: consider improving handling deleteBackward involving
        // unbreakables so that this is not necessary.
        if (anyNodesRemoved || joined) {
            this.shared.setSelection(cursorPos);
        }

        this.cleanTrailingBRs(commonAncestor);
    }

    deleteForwardChar(selection) {
        // Normalize selection
        selection = this.shared.setSelection(selection);

        const { startContainer, startOffset } = selection;
        const [endContainer, endOffset] = this.findNextPosition(startContainer, startOffset);
        if (!endContainer) {
            return;
        }
        const range = { startContainer, startOffset, endContainer, endOffset };

        for (const { callback } of this.resources["handle_delete_forward"]) {
            if (callback(range)) {
                return;
            }
        }

        const { cursorPos } = this.deleteRange(range);

        this.shared.setSelection(cursorPos);
    }

    deleteRange(range) {
        // Split text nodes in order to have elements as start/end containers.
        const { startElement, startOffset, endElement, endOffset } = this.splitTextNodes(range);
        const commonAncestor = getCommonAncestor([startElement, endElement], this.editable);

        const restoreSpaces = prepareUpdate(startElement, startOffset, endElement, endOffset);

        // Remove nodes.
        const { startRemoveIndex, allNodesRemoved, anyNodesRemoved } = this.removeNodes({
            startElement,
            startOffset,
            endElement,
            endOffset,
            commonAncestor,
        });

        // Join fragments.
        let joined;
        if (allNodesRemoved) {
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

        return { cursorPos, anyNodesRemoved, joined, commonAncestor };
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
            for (let i = startRemoveIndex; i < node.childNodes.length; i++) {
                nodesToRemove.push(node.childNodes[i]);
            }
            startRemoveIndex = childNodeIndex(node) + 1;
            node = node.parentElement;
        }

        // Remove child nodes to the left, propagate until commonAncestor (non-inclusive)
        node = endElement;
        let endRemoveIndex = endOffset;
        while (node !== commonAncestor) {
            for (let i = 0; i < endRemoveIndex; i++) {
                nodesToRemove.push(node.childNodes[i]);
            }
            endRemoveIndex = childNodeIndex(node);
            node = node.parentElement;
        }

        // Remove nodes in between subtrees
        for (let i = startRemoveIndex; i < endRemoveIndex; i++) {
            nodesToRemove.push(commonAncestor.childNodes[i]);
        }

        // Remove nodes
        let allNodesRemoved = true;
        let anyNodesRemoved = false;
        for (const node of nodesToRemove) {
            const didRemove = this.removeNode(node);
            allNodesRemoved &&= didRemove;
            anyNodesRemoved ||= didRemove;
        }
        return { startRemoveIndex, allNodesRemoved, anyNodesRemoved };
    }

    // The root argument is used by some predicates in which a node is
    // conditionally unremovable (e.g. a table cell is only removable if its
    // ancestor table is also being removed).
    isUnremovable(node, root = undefined) {
        // For now, there's no use case of unremovable text nodes.
        // Should this change, the predicates must be adapted to take a Node
        // instead of an Element as argument.
        if (node.nodeType === Node.TEXT_NODE) {
            return false;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) {
            return true;
        }
        return this.resources.unremovables.some((predicate) => predicate(node, root));
    }

    // Returns true if the entire subtree rooted at node was removed.
    // Unremovable nodes take the place of removable ancestors.
    removeNode(node) {
        const root = node;
        const remove = (node) => {
            for (const child of [...node.childNodes]) {
                remove(child);
            }
            if (this.isUnremovable(node, root)) {
                return false;
            }
            if (node.hasChildNodes()) {
                node.before(...node.childNodes);
                node.remove();
                return false;
            }
            node.remove();
            return true;
        };
        return remove(node);
    }

    getJoinableFragments(startElement, endElement, commonAncestor, offset) {
        // Starting from `element`, returns the closest block up to
        // (not-inclusive) the common ancestor. If not found, returns the
        // ancestor's child inline element.
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

        // Get joinable left
        let joinableLeft;
        if (startElement === commonAncestor) {
            // This means the element was removed from the ancestor's child list.
            // The joinable in this case is its previous sibling, but only if it's not a block.
            const previousSibling = offset ? commonAncestor.childNodes[offset - 1] : null;
            if (previousSibling && !isBlock(previousSibling)) {
                // If it's a block, as it was not involved in the deleted range, its paragraph break
                // was not affected, and it should not be joined with other elements.
                joinableLeft = { node: previousSibling, isBlock: false };
            }
        } else {
            joinableLeft = getJoinableElement(startElement);
        }

        // Get joinable right
        let joinableRight;
        if (endElement === commonAncestor) {
            // The same applies here. The joinable in this case is the sibling
            // following the last removed node, but only if it's not a block.
            const nextSibling =
                offset < nodeSize(commonAncestor) ? commonAncestor.childNodes[offset] : null;
            if (nextSibling && !isBlock(nextSibling)) {
                joinableRight = { node: nextSibling, isBlock: false };
            }
        } else {
            joinableRight = getJoinableElement(endElement);
        }

        return { joinableLeft, joinableRight };
    }

    // @todo @phoenix: document this
    // Returns whether a join was performed.
    joinFragments(startElement, endElement, commonAncestor, startRemoveIndex) {
        const { joinableLeft, joinableRight } = this.getJoinableFragments(
            startElement,
            endElement,
            commonAncestor,
            startRemoveIndex
        );

        if (!joinableLeft || !joinableRight) {
            return false;
        }

        if (joinableLeft.isBlock && joinableRight.isBlock) {
            // <h1></h1> + <p></p> -> <h1></h1>
            if (isEmptyBlock(joinableRight.node)) {
                return this.removeEmptyBlock(joinableRight.node, commonAncestor);
            }
            // <h1></h1> + <p>a</p> -> <p>a</p>
            if (isEmptyBlock(joinableLeft.node)) {
                return this.removeEmptyBlock(joinableLeft.node, commonAncestor);
            }
            return this.mergeBlocks(joinableLeft.node, joinableRight.node, commonAncestor);
        }

        if (joinableLeft.isBlock) {
            return this.joinInlineIntoBlock(joinableLeft.node, joinableRight.node, commonAncestor);
        }

        if (joinableRight.isBlock) {
            return this.joinBlockIntoInline(joinableLeft.node, joinableRight.node, commonAncestor);
        }

        return false;
    }

    isUnmergeable(node) {
        if (this.isUnremovable(node)) {
            return true;
        }
        // @todo @phoenix: get rules as resources
        return isUnbreakable(node);
    }

    canBeMerged(left, right, commonAncestor) {
        for (let node of [left, right]) {
            while (node !== commonAncestor) {
                if (this.isUnmergeable(node)) {
                    return false;
                }
                node = node.parentElement;
            }
        }
        return true;
    }

    // @todo @phoenix: called only once, consider inlining
    clearEmptyUntil(node, limitAncestor) {
        // @todo @phoenix: consider using a more robust test (like isEmpty or !isVisible)
        while (node !== limitAncestor && !node.childNodes.length) {
            const parent = node.parentElement;
            this.removeNode(node);
            node = parent;
        }
    }

    removeEmptyBlock(block, commonAncestor) {
        const parent = block.parentElement;
        const didRemove = this.removeNode(block);
        this.clearEmptyUntil(parent, commonAncestor);
        return didRemove;
    }

    mergeBlocks(left, right, commonAncestor) {
        if (!this.canBeMerged(left, right, commonAncestor)) {
            return false;
        }

        left.append(...right.childNodes);
        let toRemove = right;
        let parent = right.parentElement;
        // Propagate until commonAncestor, removing empty blocks
        while (parent !== commonAncestor && parent.childNodes.length === 1) {
            toRemove = parent;
            parent = parent.parentElement;
        }
        toRemove.remove();
        return true;
    }

    joinInlineIntoBlock(leftBlock, rightInline, commonAncestor) {
        if (!this.canBeMerged(leftBlock, rightInline, commonAncestor)) {
            return false;
        }

        while (rightInline && !isBlock(rightInline)) {
            const toAppend = rightInline;
            rightInline = rightInline.nextSibling;
            leftBlock.append(toAppend);
        }
        return true;
    }

    joinBlockIntoInline(leftInline, rightBlock, commonAncestor) {
        if (!this.canBeMerged(leftInline, rightBlock, commonAncestor)) {
            return false;
        }

        leftInline.after(...rightBlock.childNodes);
        let toRemove = rightBlock;
        let parent = rightBlock.parentElement;
        // Propagate until commonAncestor, removing empty blocks
        while (parent !== commonAncestor && parent.childNodes.length === 1) {
            toRemove = parent;
            parent = parent.parentElement;
        }
        // Restore line break between removed block and inline content after it.
        if (parent === commonAncestor) {
            const rightSibling = toRemove.nextSibling;
            if (rightSibling && !isBlock(rightSibling)) {
                rightSibling.before(this.document.createElement("br"));
            }
        }
        toRemove.remove();
        return true;
    }

    // Fill empty blocks
    // Remove empty inline elements, unless cursor is inside it
    handleEmptyElements(commonAncestor, cursorPos) {
        const handleShrunkBlock = (block) => {
            if (block === this.editable) {
                const p = this.document.createElement("p");
                p.appendChild(this.document.createElement("br"));
                this.editable.appendChild(p);
            } else {
                block.appendChild(this.document.createElement("br"));
            }
        };

        for (const node of [commonAncestor, ...descendants(commonAncestor)].toReversed()) {
            if (node.nodeType !== Node.ELEMENT_NODE) {
                continue;
            }
            if (isBlock(node)) {
                if (isShrunkBlock(node)) {
                    handleShrunkBlock(node);
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
                    this.removeNode(node);
                }
            }
        }
        if (!isBlock(commonAncestor)) {
            const closestBlockElement = closestBlock(commonAncestor);
            if (isShrunkBlock(closestBlockElement)) {
                handleShrunkBlock(closestBlockElement);
            }
        }
    }

    adjustRangeForDeletion(selection) {
        // Normalize selection (@todo @phoenix: should be offered by selection plugin)
        // Why? To make deleting more predictable and reproduceable.
        // @todo @phoenix: IMO a selection coming from a triple click should not be normalized
        selection = this.shared.setSelection(selection);

        let range = this.expandRangeToIncludeNonEditables(selection);

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
    expandRangeToIncludeNonEditables(range) {
        let { startContainer, startOffset, endContainer, endOffset, commonAncestorContainer } =
            range;
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
            const chars = [...node.textContent.slice(0, index)];
            let char = chars.pop();
            while (char) {
                index -= char.length;
                if (this.isVisibleChar(char, node, index)) {
                    return blockSwitch ? [node, index + char.length] : [node, index];
                }
                char = chars.pop();
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
            return leftPos(closestUneditable);
        }

        if (leaf.nodeType === Node.ELEMENT_NODE) {
            return blockSwitch ? rightPos(leaf) : leftPos(leaf);
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
            return rightPos(closestUneditable);
        }

        if (leaf.nodeType === Node.ELEMENT_NODE) {
            return blockSwitch ? leftPos(leaf) : rightPos(leaf);
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

    deleteBackwardUnmergeable(range) {
        const { startContainer, startOffset, endContainer } = range;
        return this.deleteCharUnmergeable(endContainer, startContainer, startOffset);
    }

    // @todo @phoenix: write tests for this
    deleteForwardUnmergeable(range) {
        const { startContainer, endContainer, endOffset } = range;
        return this.deleteCharUnmergeable(startContainer, endContainer, endOffset);
    }

    // Trap cursor inside unmergeable element. Remove it if empty.
    deleteCharUnmergeable(sourceContainer, destContainer, destOffset) {
        if (!destContainer) {
            return;
        }
        const commonAncestor = getCommonAncestor([sourceContainer, destContainer], this.editable);
        const closestUnbreakable = this.getClosestUnmergeable(sourceContainer, commonAncestor);
        if (!closestUnbreakable) {
            return;
        }

        if (isEmpty(closestUnbreakable) && !this.isUnremovable(closestUnbreakable)) {
            closestUnbreakable.remove();
            this.shared.setSelection({ anchorNode: destContainer, anchorOffset: destOffset });
        }
        return true;
    }

    getClosestUnmergeable(node, limitAncestor) {
        while (node !== limitAncestor) {
            if (this.isUnmergeable(node)) {
                return node;
            }
            node = node.parentElement;
        }
        return null;
    }
}

// @todo @phoenix: handle this:
// The first child element of a contenteditable="true" zone which
// itself is contained in a contenteditable="false" zone can not be
// removed if it is paragraph-like.
