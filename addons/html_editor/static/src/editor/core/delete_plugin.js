import { registry } from "@web/core/registry";
import { Plugin } from "../plugin";
import { closestBlock, isBlock } from "../utils/blocks";
import { CTGROUPS, CTYPES } from "../utils/content_types";
import { fillEmpty, moveNodes } from "../utils/dom";
import {
    isEditorTab,
    isEmptyBlock,
    isIconElement,
    isInPre,
    isMediaElement,
    isNotEditableNode,
    isSelfClosingElement,
    isUnbreakable,
    isUnremovable,
    isVisible,
    isVisibleTextNode,
    isWhitespace,
    isZWS,
    nextLeaf,
    paragraphRelatedElements,
    previousLeaf,
} from "../utils/dom_info";
import { splitTextNode } from "../utils/dom_split";
import { getState, prepareUpdate } from "../utils/dom_state";
import {
    closestElement,
    createDOMPathGenerator,
    descendants,
    findNode,
    firstLeaf,
    getCommonAncestor,
    getFurthestUneditableParent,
} from "../utils/dom_traversal";
import {
    DIRECTIONS,
    boundariesOut,
    childNodeIndex,
    endPos,
    leftPos,
    nodeSize,
    rightPos,
} from "../utils/position";
import { getDeepRange, setSelection } from "../utils/selection";

export class DeletePlugin extends Plugin {
    static dependencies = ["dom", "history", "selection"];
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
            case "DELETE_ELEMENT_BACKWARD":
                this.deleteElementBackward(payload);
                break;
            case "DELETE_ELEMENT_FORWARD":
                this.deleteElementForward(payload);
                break;
            case "DELETE_RANGE":
                // this.deleteRange();
                this.deleteRange();
                break;
        }
    }

    // --------------------------------------------------------------------------
    // commands
    // --------------------------------------------------------------------------

    deleteRange() {
        let selection = this.shared.getEditableSelection();
        if (selection.isCollapsed) {
            return;
        }

        selection = this.deleteRangeAjustSelection(selection);
        this.deleteSelection(selection);
    }

    /**
     *
     * @param {import("./selection_plugin").EditorSelection} selection
     */
    deleteSelection(selection) {
        // Split text nodes in order to have elements as start/end containers.
        const { startElement, startOffset, endElement, endOffset, commonAncestor } =
            this.splitTextNodes(selection);

        const restore = prepareUpdate(startElement, startOffset, endElement, endOffset);

        // Remove nodes.
        const { startRemoveIndex, adjustedEndRemoveIndex } = this.removeNodes({
            startElement,
            startOffset,
            endElement,
            endOffset,
            commonAncestor,
        });

        // Set cursor.
        this.setCursorAfterRemoveNodes({
            commonAncestor,
            startElement,
            endElement,
            startRemoveIndex,
            adjustedEndRemoveIndex,
            direction: selection.direction,
        });

        // Join fragments if they are part of direct sibling sub-trees under
        // commonAncestor. If start or end element is commonAncestor, it means
        // there's no fragment to be joined.
        if (
            startRemoveIndex === adjustedEndRemoveIndex &&
            startElement !== commonAncestor &&
            endElement !== commonAncestor
        ) {
            this.joinFragments(startElement, endElement, commonAncestor);
        }

        // Fill empty blocks, remove empty inlines.
        this.handleEmptyElements(commonAncestor);

        // Restore spaces state.
        const preserveCursor = this.shared.getEditableSelection();
        restore();
        this.shared.setSelection(preserveCursor);

        this.dispatch("ADD_STEP");
    }

    /**
     * Splits text nodes and returns the updated container elements and offset values.
     *
     * @param {import("./selection_plugin").EditorSelection} params
     * @returns {Object} start, end and common ancestor elements and offsets
     */
    splitTextNodes({
        startContainer,
        startOffset,
        endContainer,
        endOffset,
        commonAncestorContainer,
    }) {
        if (endContainer.nodeType === Node.TEXT_NODE) {
            const newNode = endContainer.splitText(endOffset);
            [endContainer, endOffset] = [newNode.parentElement, childNodeIndex(newNode)];
        }
        if (startContainer.nodeType === Node.TEXT_NODE) {
            const newNode = startContainer.splitText(startOffset);
            [startContainer, startOffset] = [newNode.parentElement, childNodeIndex(newNode)];
            if (startContainer === endContainer) {
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
        while (node !== commonAncestor) {
            // @phoenix @todo: handle unremovable nodes
            [...node.childNodes].slice(startRemoveIndex).forEach((child) => child.remove());
            startRemoveIndex = childNodeIndex(node) + 1;
            node = node.parentElement;
        }

        // Remove child nodes to the left, propagate until commonAncestor (non-inclusive)
        node = endElement;
        let endRemoveIndex = endOffset;
        while (node !== commonAncestor) {
            // @phoenix @todo: handle unremovable nodes
            [...node.childNodes].slice(0, endRemoveIndex).forEach((child) => child.remove());
            endRemoveIndex = childNodeIndex(node);
            node = node.parentElement;
        }

        // Remove nodes in between subtrees
        let nRemovedNodes = 0;
        for (const node of [...commonAncestor.childNodes].slice(startRemoveIndex, endRemoveIndex)) {
            nRemovedNodes += Number(this.removeNode(node));
        }
        const adjustedEndRemoveIndex = endRemoveIndex - nRemovedNodes;
        return { startRemoveIndex, adjustedEndRemoveIndex };
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

    setCursorAfterRemoveNodes({
        commonAncestor,
        startElement,
        startRemoveIndex,
        endElement,
        adjustedEndRemoveIndex,
        direction,
    }) {
        if (direction === DIRECTIONS.RIGHT) {
            if (startElement === commonAncestor) {
                this.shared.setSelection({
                    anchorNode: commonAncestor,
                    anchorOffset: startRemoveIndex,
                });
            } else {
                this.shared.setCursorEnd(startElement);
            }
        } else {
            if (endElement === commonAncestor) {
                this.shared.setSelection({
                    anchorNode: commonAncestor,
                    anchorOffset: adjustedEndRemoveIndex,
                });
            } else {
                this.shared.setCursorStart(endElement);
            }
        }
    }

    joinFragments(left, right, commonAncestor) {
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

        const joinableLeft = getJoinableElement(left);
        const joinableRight = getJoinableElement(right);

        if (joinableLeft.isBlock && joinableRight.isBlock) {
            this.mergeBlocks(joinableLeft.element, joinableRight.element, commonAncestor);
            return;
        }

        if (joinableLeft.isBlock) {
            this.joinInlineIntoBlock(joinableLeft.element, joinableRight.element);
            return;
        }

        if (joinableRight.isBlock) {
            this.joinBlockIntoInline(joinableLeft.element, joinableRight.element);
            return;
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

        // Unmergeable blocks can be removed if left empty.
        if (!isVisible(right)) {
            const parent = right.parentElement;
            right.remove();
            this.shared.setCursorEnd(left);
            clearEmpty(parent);
            return;
        }

        if (!isVisible(left)) {
            const parent = left.parentElement;
            left.remove();
            this.shared.setCursorStart(right);
            clearEmpty(parent);
            return;
        }

        if (!this.canBeMerged(left, right)) {
            return;
        }

        this.shared.setCursorEnd(left);
        left.append(...right.childNodes);
        const rightParent = right.parentElement;
        right.remove();
        clearEmpty(rightParent);
    }

    joinInlineIntoBlock(leftBlock, rightInline) {
        if (!this.canBeMerged(leftBlock, rightInline)) {
            return;
        }

        while (rightInline && !isBlock(rightInline)) {
            // @todo @phoenix: what if right is a BR?
            const toAppend = rightInline;
            rightInline = rightInline.nextSibling;
            leftBlock.append(toAppend);
        }
    }

    joinBlockIntoInline(leftInline, rightBlock) {
        if (!this.canBeMerged(leftInline, rightBlock)) {
            return;
        }

        leftInline.after(...rightBlock.childNodes);
        const rightSibling = rightBlock.nextSibling;
        rightBlock.remove();
        if (rightSibling && !isBlock(rightSibling)) {
            rightSibling.before(this.document.createElement("br"));
        }
        // @todo @phoenix: clear empty parent blocks.
    }

    // Fill empty blocks
    // Remove empty inline elements, unless cursor is inside it
    handleEmptyElements(commonAncestor) {
        const selection = this.shared.getEditableSelection();
        for (const node of [commonAncestor, ...descendants(commonAncestor)].toReversed()) {
            if (node.nodeType !== Node.ELEMENT_NODE) {
                continue;
            }
            if (isBlock(node)) {
                fillEmpty(node);
            } else if (!isVisible(node)) {
                if (node.contains(selection.anchorNode)) {
                    // Add zws to empty inline element
                    // @todo @phoenix: this sets the selection via setSelection (it should not)
                    // @todo @phoenix: shouldn't this be done by a method by the zws plugin?
                    fillEmpty(node);
                } else {
                    node.remove();
                }
            }
        }
        // In case common ancestor is not a block (fillEmpty looks for closest block)
        fillEmpty(commonAncestor);
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

    deleteBackward() {
        let selection = this.shared.getEditableSelection();
        // @todo @phoenix try to use the newDeleteRange instead
        // if (selection.isCollapsed) {
        //     const [node, offset] = getDeepestPosition(selection.anchorNode, selection.anchorOffset);
        //     if (offset) {
        //         this.shared.setSelection({
        //             anchorNode: node,
        //             anchorOffset: offset - 1,
        //             focusNode: node,
        //             focusOffset: offset,
        //         });
        //     } else {
        //         const prevLeaf = previousLeaf(node, this.editable, true);
        //         if (!prevLeaf) {
        //             return;
        //         }
        //         const blockSwitch = closestBlock(node) !== closestBlock(prevLeaf);
        //         this.shared.setSelection({
        //             anchorNode: prevLeaf,
        //             anchorOffset: nodeSize(prevLeaf) - (blockSwitch ? 0 : 1),
        //             focusNode: node,
        //             focusOffset: offset,
        //         });
        //     }
        // }
        // this.newDeleteRange();
        // if (!selection.isCollapsed && !collapseIfZWS(this.editable, selection)) {
        if (!selection.isCollapsed) {
            this.deleteRange();
            // this.deleteRange();
            return;
        }
        selection = this.shared.getEditableSelection();

        this.deleteElementBackward({
            targetNode: selection.anchorNode,
            targetOffset: selection.anchorOffset,
        });
        this.dispatch("ADD_STEP");
    }
    deleteForward() {
        let selection = this.shared.getEditableSelection();
        if (!selection.isCollapsed) {
            // if (!selection.isCollapsed && !collapseIfZWS(this.editable, selection)) {
            // this.deleteRange();
            this.deleteRange();
            return;
        }
        selection = this.shared.getEditableSelection();

        this.deleteElementForward({
            targetNode: selection.anchorNode,
            targetOffset: selection.anchorOffset,
        });
        this.dispatch("ADD_STEP");
    }

    deleteElementBackward(params) {
        const { targetNode, targetOffset = 0 } = params;

        for (const { callback } of this.resources["delete_element_backward_before"]) {
            if (callback({ ...params })) {
                return;
            }
        }

        const shouldStop =
            this.deleteElementBackwardTextNode(targetNode, targetOffset) ||
            this.deleteElementBackwardBR(targetNode, targetOffset) ||
            this.deleteElementBackwardElement(targetNode, targetOffset) ||
            this.deleteElementBackwardBeforeInline(targetNode, targetOffset, params.alreadyMoved) ||
            this.deleteElementBackwardInsideInline(targetNode, targetOffset, params.alreadyMoved) ||
            this.deleteElementBackwardBlockAndPreviousEmpty(targetNode, targetOffset) ||
            this.deleteElementBackwardTransformBlock(targetNode, targetOffset) ||
            // @todo @phoenix probably remove this specific code
            this.deleteElementBackwardUnbreakableUnremovable(targetNode, targetOffset);

        if (shouldStop) {
            return;
        }

        // Get the current nextSibling before moving the nodes.
        const nextSibling = targetNode.nextSibling;

        const [moveDest, alreadyMoved, cursorNode, cursorOffset] =
            this.deleteElementBackwardMoveNode(
                targetNode,
                targetOffset,
                params.alreadyMoved,
                params.offsetLimit
            );
        this.shared.setSelection({ anchorNode: cursorNode, anchorOffset: cursorOffset });

        // Propagate if this is still a block on the left of where the nodes
        // were moved.
        this.deleteElementBackwardPropagate(
            nextSibling,
            moveDest,
            cursorNode,
            cursorOffset,
            alreadyMoved
        );
    }
    deleteElementBackwardTextNode(target, offset) {
        if (target.nodeType === Node.TEXT_NODE) {
            if (offset) {
                const charSize = [...target.nodeValue.slice(0, offset)].pop().length;
                deleteText(
                    target,
                    charSize,
                    offset - charSize,
                    DIRECTIONS.LEFT,
                    this.deleteElementBackward.bind(this)
                );
            } else {
                this.deleteElementBackward({
                    targetNode: target.parentElement,
                    targetOffset: childNodeIndex(target),
                });
            }
            return true;
        }
    }
    deleteElementBackwardBR(targetNode, params) {
        // @todo @phoenix document this part
        if (targetNode.tagName === "BR") {
            const parentOffset = childNodeIndex(targetNode);
            const rightState = getState(
                targetNode.parentElement,
                parentOffset + 1,
                DIRECTIONS.RIGHT
            ).cType;
            if (rightState & CTYPES.BLOCK_INSIDE) {
                this.deleteElementBackward({
                    targetNode: targetNode.parentElement,
                    targetOffset: parentOffset,
                    alreadyMoved: params.alreadyMoved,
                });
                return true;
            }
        }
    }
    deleteElementBackwardElement(targetNode, targetOffset) {
        const domPathGenerator = createDOMPathGenerator(DIRECTIONS.LEFT, {
            leafOnly: true,
            stopTraverseFunction: isDeletable,
        });
        const domPath = domPathGenerator(targetNode, targetOffset);
        const leftDeletableLeaf = domPath.next().value;
        if (leftDeletableLeaf && isDeletable(leftDeletableLeaf)) {
            leftDeletableLeaf.remove();
            return true;
        }
    }
    /**
     * Backspace just after an inline node, convert to backspace at the
     * end of that inline node.
     *
     * E.g. <p>abc<i>def</i>[]</p> + BACKSPACE
     * <=>  <p>abc<i>def[]</i></p> + BACKSPACE
     */
    deleteElementBackwardBeforeInline(targetNode, targetOffset, alreadyMoved) {
        const leftNode = targetNode.childNodes[targetOffset - 1];

        if (targetOffset && leftNode && (!isBlock(leftNode) || isSelfClosingElement(leftNode))) {
            this.deleteElementBackward({
                targetNode: leftNode,
                targetOffset: nodeSize(leftNode),
                alreadyMoved,
            });
            return true;
        }
    }
    /**
     * Backspace at the beginning of an inline node, nothing has to be
     * done: propagate the backspace. If the node was empty, we remove
     * it before.
     *
     * E.g. <p>abc<b></b><i>[]def</i></p> + BACKSPACE
     * <=>  <p>abc<b>[]</b><i>def</i></p> + BACKSPACE
     * <=>  <p>abc[]<i>def</i></p> + BACKSPACE
     */
    deleteElementBackwardInsideInline(targetNode, targetOffset, alreadyMoved) {
        const contentIsZWS = targetNode.textContent === "\u200B";
        const parentElement = targetNode.parentElement;
        const closestLi = closestElement(targetNode, "li");
        // @todo @phoenix
        // specific to li: (closestLi && !closestLi.previousElementSibling)
        // Investigate if this code is still usefull and remove it if not,
        // remove it.
        if (
            !targetOffset &&
            ((closestLi && !closestLi.previousElementSibling) ||
                !isBlock(targetNode) ||
                isSelfClosingElement(targetNode))
        ) {
            const parentOffset = childNodeIndex(targetNode);

            if (!nodeSize(targetNode) || contentIsZWS) {
                const visible = isVisible(targetNode);
                const restore = prepareUpdate(...boundariesOut(targetNode));
                targetNode.remove();
                restore();

                fillEmpty(parentElement);

                if (visible) {
                    // TODO this handle BR/IMG/etc removals../ to see if we
                    // prefer to have a dedicated handler for every possible
                    // HTML element or if we let this generic code handle it.
                    this.shared.setSelection({
                        anchorNode: parentElement,
                        anchorOffset: parentOffset,
                    });
                    return true;
                }
            }
            this.deleteElementBackward({
                targetNode: parentElement,
                targetOffset: parentOffset,
                alreadyMoved: alreadyMoved,
            });
            return true;
        }
    }
    /**
     * If we are at the beninning of a block node,
     * and the previous node is empty, remove it.
     *
     *  E.g. <p><br></p><h1>[]def</h1> + BACKSPACE
     *  <=>  <h1>[]def</h1>
     */
    deleteElementBackwardBlockAndPreviousEmpty(targetNode, targetOffset) {
        const previousElementSiblingClosestBlock = closestBlock(targetNode.previousElementSibling);
        if (
            !targetOffset &&
            previousElementSiblingClosestBlock &&
            (isEmptyBlock(previousElementSiblingClosestBlock) ||
                previousElementSiblingClosestBlock.textContent === "\u200B") &&
            paragraphRelatedElements.includes(targetNode.nodeName)
        ) {
            previousElementSiblingClosestBlock.remove();
            this.shared.setCursorStart(targetNode);
            return true;
        }
    }
    deleteElementBackwardTransformBlock(targetNode, targetOffset) {
        // @todo @phoenix could be specific ?
        //
        // Backspace at the beginning of a block node. If it doesn't have a left
        // block and it is one of the special block formatting tags below then
        // convert the block into a P.

        const closestLi = closestElement(targetNode, "li");
        if (
            !targetOffset &&
            !targetNode.previousElementSibling &&
            ["BLOCKQUOTE", "H1", "H2", "H3", "PRE"].includes(targetNode.nodeName) &&
            !closestLi
        ) {
            const p = this.document.createElement("p");
            p.replaceChildren(...targetNode.childNodes);
            targetNode.replaceWith(p);
            this.shared.setSelection({ anchorNode: p, anchorOffset: targetOffset });
            return true;
        }
    }
    deleteElementBackwardUnbreakableUnremovable(targetNode, targetOffset) {
        // @todo @phoenix specific to unremovable
        if (!targetOffset && isUnremovable(targetNode)) {
            // throw UNREMOVABLE_ROLLBACK_CODE;
            return true;
        }
        // @todo @phoenix specific to unremovable
        // Empty unbreakable blocks should be removed with backspace, with the
        // notable exception of Bootstrap columns.
        // @specific to bootstrap columns
        if (
            !targetOffset &&
            isUnbreakable(targetNode) &&
            // (REGEX_BOOTSTRAP_COLUMN.test(targetNode.className) || !isEmptyBlock(targetNode))
            !isEmptyBlock(targetNode)
        ) {
            // throw UNBREAKABLE_ROLLBACK_CODE;
            return true;
        }
        // @todo @phoenix specific ?
        // Handle editable sub-nodes
        const parentElement = targetNode.parentElement;
        if (
            parentElement &&
            parentElement.getAttribute("contenteditable") === "true" &&
            parentElement.oid !== "root" &&
            parentElement.parentElement &&
            !parentElement.parentElement.isContentEditable &&
            paragraphRelatedElements.includes(targetNode.tagName) &&
            !targetNode.previousElementSibling
        ) {
            // The first child element of a contenteditable="true" zone which
            // itself is contained in a contenteditable="false" zone can not be
            // removed if it is paragraph-like.
            // throw UNREMOVABLE_ROLLBACK_CODE;
            return true;
        }
    }
    deleteElementBackwardMoveNode(targetNode, targetOffset, alreadyMoved, offsetLimit) {
        const leftNode = targetNode.childNodes[targetOffset - 1];
        let moveDest;
        if (targetOffset) {
            // Backspace just after a block node, we have to move any inline
            // content after it, up to the next block. If the cursor is between
            // two blocks, this is a theoretical case: just do nothing.
            //
            // E.g. <p>abc</p>[]de<i>f</i><p>ghi</p> + BACKSPACE
            // <=>  <p>abcde<i>f</i></p><p>ghi</p>
            alreadyMoved = true;
            moveDest = endPos(leftNode);
        } else {
            moveDest = leftPos(targetNode);
        }

        let node = targetNode.childNodes[targetOffset];
        let currentNodeIndex = targetOffset;

        // `offsetLimit` will ensure we never move nodes that were not initialy in
        // the element => when Deleting and merging an element the containing node
        // will temporarily be hosted in the common parent beside possible other
        // nodes. We don't want to touch those other nodes when merging two html
        // elements ex : <div>12<p>ab[]</p><p>cd</p>34</div> should never touch the
        // 12 and 34 text node.
        if (offsetLimit === undefined) {
            while (node && !isBlock(node)) {
                node = node.nextSibling;
                currentNodeIndex++;
            }
        } else {
            currentNodeIndex = offsetLimit;
        }
        const [cursorNode, cursorOffset] = moveNodes(
            ...moveDest,
            targetNode,
            targetOffset,
            currentNodeIndex
        );
        return [moveDest, alreadyMoved, cursorNode, cursorOffset];
    }
    deleteElementBackwardPropagate(nextSibling, moveDest, cursorNode, cursorOffset, alreadyMoved) {
        if (
            cursorNode.nodeType === Node.TEXT_NODE &&
            (cursorOffset === 0 || cursorOffset === cursorNode.length)
        ) {
            cursorOffset = childNodeIndex(cursorNode) + (cursorOffset === 0 ? 0 : 1);
            cursorNode = cursorNode.parentNode;
        }
        if (cursorNode.nodeType !== Node.TEXT_NODE) {
            const { cType } = getState(cursorNode, cursorOffset, DIRECTIONS.LEFT);
            if ((cType & CTGROUPS.BLOCK && !alreadyMoved) || cType === CTYPES.BLOCK_OUTSIDE) {
                this.deleteElementBackward({
                    targetNode: cursorNode,
                    targetOffset: cursorOffset,
                    alreadyMoved,
                });
            } else if (!alreadyMoved) {
                // When removing a block node adjacent to an inline node, we need to
                // ensure the block node induced line break are kept with a <br>.
                // ex : <div>a<span>b</span><p>[]c</p>d</div> => deleteBakward =>
                // <div>a<span>b</span>[]c<br>d</div> In this case we cannot simply
                // merge the <p> content into the div parent, or we would lose the
                // line break located after the <p>.
                const cursorNodeNode = cursorNode.childNodes[cursorOffset];
                const cursorNodeRightNode = cursorNodeNode ? cursorNodeNode.nextSibling : undefined;
                if (
                    cursorNodeRightNode &&
                    cursorNodeRightNode.nodeType === Node.TEXT_NODE &&
                    nextSibling === cursorNodeRightNode
                ) {
                    moveDest[0].insertBefore(document.createElement("br"), cursorNodeRightNode);
                }
            }
        }
    }

    deleteElementForward(params) {
        for (const { callback } of this.resources["delete_element_forward_before"]) {
            if (callback({ ...params })) {
                return;
            }
        }

        function getFirstRightLeafNode(node, offset) {
            const rightLeafOnlyNotBlockNotEditablePath = createDOMPathGenerator(DIRECTIONS.RIGHT, {
                leafOnly: true,
                stopTraverseFunction: (node) => isNotEditableNode(node) || isBlock(node),
                stopFunction: (node) => isBlock(node) && !isNotEditableNode(node),
            });

            return findNode(rightLeafOnlyNotBlockNotEditablePath(node, offset), filterFunc);
        }

        const { targetNode, targetOffset } = params;
        const firstRightLeafNode = getFirstRightLeafNode(targetNode, targetOffset);

        this.deleteElementForwardText(targetNode, targetOffset) ||
            this.deleteElementForwardZWSParent(firstRightLeafNode, targetNode.parentElement) ||
            this.deleteElementForwardZWS(targetNode) ||
            this.deleteElementForwardBlock(firstRightLeafNode) ||
            this.deleteElementForwardPropagate(firstRightLeafNode) ||
            // @todo @phoenix should it be handled by deleteElementForwardBlock?
            // this.deleteElementForwardNotEditableBlock(targetNode) ||
            // this.deleteElementForwardUnremovable() ||
            // this.deleteElementForwardUnbreakable() ||
            this.deleteElementForwardToBackward(firstRightLeafNode, targetNode, targetOffset);
    }
    deleteElementForwardText(targetNode, targetOffset) {
        if (targetNode.nodeType === Node.TEXT_NODE) {
            if (targetOffset === targetNode.nodeValue.length) {
                // Delete at the end of a text node is not a specific case to handle,
                // let the element implementation handle it.
                this.deleteElementForward({
                    targetNode: targetNode.parentElement,
                    targetOffset: childNodeIndex(targetNode) + 1,
                });
            } else {
                // Get the size of the unicode character to remove.
                const charSize = [...targetNode.nodeValue.slice(0, targetOffset + 1)].pop().length;
                deleteText(
                    targetNode,
                    charSize,
                    targetOffset,
                    DIRECTIONS.RIGHT,
                    this.deleteElementForward.bind(this)
                );
            }
            return true;
        }
    }
    deleteElementForwardZWSParent(firstRightLeafNode, parentElement) {
        if (
            firstRightLeafNode &&
            isZWS(firstRightLeafNode) &&
            parentElement.hasAttribute("data-oe-zws-empty-inline")
        ) {
            const grandparent = parentElement.parentElement;
            if (!grandparent) {
                return true;
            }

            const parentIndex = childNodeIndex(parentElement);
            const restore = prepareUpdate(...boundariesOut(parentElement));
            parentElement.remove();
            restore();
            this.deleteElementForward({
                targetNode: grandparent,
                targetOffset: parentIndex,
            });
            return true;
        }
    }
    deleteElementForwardZWS(targetNode) {
        if (
            targetNode.hasAttribute &&
            targetNode.hasAttribute("data-oe-zws-empty-inline") &&
            (isZWS(targetNode) ||
                (targetNode.textContent === "" && targetNode.childNodes.length === 0))
        ) {
            const parent = targetNode.parentElement;
            if (!parent) {
                return true;
            }

            const index = childNodeIndex(targetNode);
            const restore = prepareUpdate(...boundariesOut(targetNode));
            targetNode.remove();
            restore();
            this.deleteElementForward({
                targetNode: parent,
                targetOffset: index,
            });
            return true;
        }
    }
    deleteElementForwardBlock(firstRightLeafNode) {
        if (
            firstRightLeafNode &&
            (isIconElement(firstRightLeafNode) || isNotEditableNode(firstRightLeafNode))
        ) {
            const nextSibling = firstRightLeafNode.nextSibling;
            const nextSiblingText = nextSibling ? nextSibling.textContent : "";
            firstRightLeafNode.remove();
            if (isEditorTab(firstRightLeafNode) && nextSiblingText[0] === "\u200B") {
                // When deleting an editor tab, we need to ensure it's related
                // ZWS will deleted as well.
                nextSibling.textContent = nextSiblingText.replace("\u200B", "");
            }
            return true;
        }
    }
    deleteElementForwardPropagate(firstRightLeafNode) {
        // @todo @phoenix document this part
        if (
            firstRightLeafNode &&
            !(
                firstRightLeafNode.nodeName === "BR" &&
                getState(...rightPos(firstRightLeafNode), DIRECTIONS.RIGHT).cType ===
                    CTYPES.BLOCK_INSIDE
            )
        ) {
            this.deleteElementForward({
                targetNode: firstRightLeafNode,
                targetOffset: Math.min(1, nodeSize(firstRightLeafNode)),
            });
            return true;
        }
    }
    deleteElementForwardNotEditableBlock(targetNode) {
        // Remove the nextSibling if it is a non-editable element.
        const nextSibling = targetNode.nextSibling;
        if (
            nextSibling &&
            nextSibling.nodeType === Node.ELEMENT_NODE &&
            !nextSibling.isContentEditable
        ) {
            nextSibling.remove();
            return true;
        }
    }
    deleteElementForwardUnremovable() {
        // @phoenix specific to unremovable
        // // Prevent the deleteForward operation since it is done at the end of an
        // // enclosed editable zone (inside a non-editable zone in the editor).
        // if (
        //     parentElement &&
        //     parentElement.getAttribute("contenteditable") === "true" &&
        //     parentElement.oid !== "root" &&
        //     parentElement.parentElement &&
        //     !parentElement.parentElement.isContentEditable &&
        //     paragraphRelatedElements.includes(targetNode.tagName) &&
        //     !targetNode.nextElementSibling
        // ) {
        //     throw UNREMOVABLE_ROLLBACK_CODE;
        // }
    }
    deleteElementForwardUnbreakable() {
        // @phoenix specific to unbreakable
        // // If next sibblings is an unbreakable node, and current node is empty, we
        // // delete the current node and put the selection at the beginning of the
        // // next sibbling.
        // if (firstOutNode && nextSibling && isUnbreakable(nextSibling) && isEmptyBlock(targetNode)) {
        //     const restore = prepareUpdate(...boundariesOut(targetNode));
        //     targetNode.remove();
        //     restore();
        //     this.shared.setSelection(firstOutNode, 0);
        //     return;
        // }
    }
    deleteElementForwardToBackward(firstRightLeafNode, targetNode, targetOffset) {
        const rightLeaf = createDOMPathGenerator(DIRECTIONS.RIGHT, {
            leafOnly: true,
            stopFunction: (node) => !this.editable.contains(node),
        });
        const rightFirstOutNode = findNode(
            rightLeaf(
                ...(firstRightLeafNode ? rightPos(firstRightLeafNode) : [targetNode, targetOffset])
            ),
            filterFunc
        );
        if (rightFirstOutNode) {
            const [leftNode, leftOffset] = leftPos(rightFirstOutNode);
            this.deleteElementBackward({
                targetNode: leftNode,
                targetOffset: leftOffset,
                fromForward: true,
            });
            return true;
        }
    }

    // @phoenix @todo: delete me and my helper methods! (leaving it for now for reference)
    _deleteRange() {
        for (const { callback } of this.resources["delete_range_before"]) {
            if (callback()) {
                return;
            }
        }
        // @todo @phoenix shouldn't it be done somewhere else?
        // function fixEmptyEditable() {
        //     // if (!this.editable.childElementCount) {
        //     //     // Ensure the editable has content.
        //     //     const p = this.document.createElement("p");
        //     //     p.append(document.createElement("br"));
        //     //     this.editable.append(p);
        //     //     this.shared.setSelection(p, 0);
        //     //     return;
        //     // }
        // }
        // fixEmptyEditable();

        let [selection, extractRange] = this.deleteRangeGetSelectionAndRange();

        const insertedZws = this.deleteRangeProtectForExtractContents(selection, extractRange);

        const { startContainer, startOffset, endContainer, endOffset } = extractRange;
        const [startBlock, endBlock] = [closestBlock(startContainer), closestBlock(endContainer)];
        const next = nextLeaf(endContainer, this.editable);

        this.deleteRangeSplitTextNode(startContainer, startOffset, endContainer, endOffset);
        const restoreUpdate = this.deleteRangeGetRestore(startContainer, endContainer);

        // ---------------------------------------------------------------------

        // Let the DOM split and delete the range.
        extractRange.extractContents();

        this.shared.setCursorEnd(startContainer);
        selection = this.shared.getEditableSelection();
        const documentRange = getDeepRange(this.editable, { sel: selection });

        // ---------------------------------------------------------------------

        this.deleteRangeRestoreUnremovable();

        // @todo @phoenix do we want to handle unremovable here?
        const isRemovableInvisible = (node) =>
            !isVisible(node) && !isZWS(node) && !isUnremovable(node);
        const newEndContainer = this.deleteRangeRemoveEndContainerIfEmpty(
            endContainer,
            documentRange.endContainer,
            isRemovableInvisible
        );
        const newStartContainer = this.deleteRangeRemoveStartContainerIfEmpty(
            startContainer,
            documentRange.startContainer,
            newEndContainer,
            isRemovableInvisible
        );

        this.deletRangeFillEmpty(newStartContainer, newEndContainer);

        const joinWith = this.deleteRangeRejoinBlocks(
            extractRange,
            documentRange,
            startBlock,
            endBlock,
            next
        );

        this.deleteRangeRemoveEmptyStart(startBlock, endBlock);
        this.deleteRangeRemoveZws(insertedZws);
        this.deleteRangeFillJoined(joinWith);

        const selectionToRestore = this.shared.getEditableSelection();
        restoreUpdate();
        this.shared.setSelection(selectionToRestore, false);
    }
    deleteRangeGetSelectionAndRange() {
        const selection = this.shared.getEditableSelection();
        // @todo @phoenix is it still needed?
        // let range = getDeepRange(this.editable, {
        //     sel,
        //     splitText: true,
        //     select: true,
        //     correctTripleClick: true,
        // });
        // if (!range) {
        //     return;
        // }
        // const range = selection.getRangeAt(0);
        const range = new Range();
        range.setStart(selection.startContainer, selection.startOffset);
        range.setEnd(selection.endContainer, selection.endOffset);
        // Expand the range to fully include all contentEditable=False elements.
        const commonAncestorContainer = range.commonAncestorContainer;
        const startUneditable = getFurthestUneditableParent(
            range.startContainer,
            commonAncestorContainer
        );
        if (startUneditable) {
            const leaf = previousLeaf(startUneditable);
            if (leaf) {
                range.setStart(leaf, nodeSize(leaf));
            } else {
                range.setStart(commonAncestorContainer, 0);
            }
        }
        const endUneditable = getFurthestUneditableParent(
            selection.endContainer,
            commonAncestorContainer
        );
        if (endUneditable) {
            const leaf = nextLeaf(endUneditable);
            if (leaf) {
                range.setEnd(leaf, 0);
            } else {
                range.setEnd(commonAncestorContainer, nodeSize(commonAncestorContainer));
            }
        }
        return [selection, range];
    }
    deleteRangeProtectForExtractContents(selection, range) {
        if (
            selection &&
            !selection.isCollapsed &&
            !range.startOffset &&
            !range.startContainer.previousSibling
        ) {
            // Insert a zero-width space before the selection if the selection
            // is non-collapsed and at the beginning of its parent, so said
            // parent will have content after extraction. This ensures that the
            // parent will not be removed by "tricking" `range.extractContents`.
            // Eg, <h1><font>[...]</font></h1> will preserve the styles of the
            // <font> node. If it remains empty, it will be cleaned up later by
            // the sanitizer.
            const zws = this.document.createTextNode("\u200B");
            range.startContainer.before(zws);
            return zws;
        }
    }
    deleteRangeSplitTextNode(startContainer, startOffset, endContainer, endOffset) {
        // Get the boundaries of the range so as to get the state to restore.
        if (endContainer.nodeType === Node.TEXT_NODE) {
            splitTextNode(endContainer, endOffset);
            endOffset = nodeSize(endContainer);
        }
        if (startContainer.nodeType === Node.TEXT_NODE) {
            splitTextNode(startContainer, startOffset);
            startOffset = 0;
        }
        return [startOffset, endOffset];
    }
    deleteRangeGetRestore(startContainer, endContainer) {
        return prepareUpdate(
            ...boundariesOut(startContainer).slice(0, 2),
            ...boundariesOut(endContainer).slice(2, 4),
            { allowReenter: false, label: "deleteRange" }
        );
    }
    deleteRangeRestoreUnremovable() {
        // @todo @phoenix this is not tested and the code seems wrong (if there is multiples unremovable, inside another unremovable, how could it work?)
        // const restoreUnremovable = () => {
        //     // Restore unremovables removed by extractContents.
        //     [...contents.querySelectorAll("*")].filter(isUnremovable).forEach((n) => {
        //         closestBlock(newRange.endContainer).after(n);
        //         n.textContent = "";
        //     });
        // };
        // restoreUnremovable();
    }
    deleteRangeRemoveEndContainerIfEmpty(
        currentEndContainer,
        newEndContainer,
        isRemovableInvisible
    ) {
        // If the end container was fully selected, extractContents may have
        // emptied it without removing it. Ensure it's gone.
        while (
            currentEndContainer &&
            isRemovableInvisible(currentEndContainer) &&
            !currentEndContainer.contains(newEndContainer)
        ) {
            const parent = currentEndContainer.parentNode;
            currentEndContainer.remove();
            currentEndContainer = parent;
        }
        return currentEndContainer;
    }
    deleteRangeRemoveStartContainerIfEmpty(
        currentStartContainer,
        newStartContainer,
        newEndContainer,
        isRemovableInvisible
    ) {
        const endIsStart = newStartContainer === newEndContainer;
        // Same with the start container
        while (
            currentStartContainer &&
            !isBlock(currentStartContainer) &&
            isRemovableInvisible(currentStartContainer) &&
            !(endIsStart && currentStartContainer.contains(newStartContainer))
        ) {
            const parent = currentStartContainer.parentNode;
            currentStartContainer.remove();
            currentStartContainer = parent;
        }
        return currentStartContainer;
    }
    deletRangeFillEmpty(currentStartContainer, newEndContainer) {
        // Ensure empty blocks be given a <br> child.
        if (currentStartContainer) {
            fillEmpty(closestBlock(currentStartContainer));
        }
        fillEmpty(closestBlock(newEndContainer));
    }
    deleteRangeRejoinBlocks(range, newRange, startBlock, endBlock, next) {
        // let next = nextLeaf(endContainer, this.editable);
        const doJoin =
            (startBlock !== closestBlock(range.commonAncestorContainer) ||
                endBlock !== closestBlock(range.commonAncestorContainer)) &&
            startBlock.tagName !== "TD" &&
            endBlock.tagName !== "TD";
        let joinWith = newRange.endContainer;
        const getRightLeaf = createDOMPathGenerator(DIRECTIONS.RIGHT, {
            leafOnly: true,
            stopTraverseFunction: isBlock,
            stopFunction: isBlock,
        });
        const rightLeaf = getRightLeaf(joinWith).next().value;
        if (rightLeaf && rightLeaf.nodeValue === " ") {
            joinWith = rightLeaf;
        }
        // Rejoin blocks that extractContents may have split in two.
        let i = 0;
        // @todo @phoenix seems odd to call deleteElementBackward to joins
        // the elements. That might have unwanted side effects if plugins
        // have custom delete behaviors. This should probably be done in a
        // different way, avoidind to need getCurrentMutationLength and
        // reverting the mutations.
        while (
            doJoin &&
            next &&
            !(next.previousSibling && next.previousSibling === joinWith) &&
            this.editable.contains(next) &&
            // @todo @phoenix this seems specific to table
            closestElement(joinWith, "TD") === closestElement(next, "TD")
        ) {
            // @todo @phoenix see if we still need it
            if (i++ > 100) {
                throw new Error("Infinite loop in deleteRangeRejoinBlocks");
            }
            // @todo @phoenix see if we still need it
            // const restore = preserveCursor(this.document);
            // this.observerFlush();
            this.shared.handleObserverRecords();
            const mutationsLength = this.shared.getCurrentMutations().length;
            const backupSelection = this.shared.getEditableSelection();
            this.deleteElementBackward({
                targetNode: next,
                targetOffset: 0,
            });
            if (!this.editable.contains(joinWith)) {
                this.shared.handleObserverRecords();
                this.shared.revertCurrentMutationsUntil(mutationsLength);
                this.shared.setSelection(backupSelection);
                break;
            }
            next = firstLeaf(next);

            // const res = this._protect(() => {
            // if (!this.editable.contains(joinWith)) {
            //     this._toRollback = UNREMOVABLE_ROLLBACK_CODE; // tried to delete too far -> roll it back.
            // } else {
            // }
            // }, this._currentStep.mutations.length);
            // if ([UNBREAKABLE_ROLLBACK_CODE, UNREMOVABLE_ROLLBACK_CODE].includes(res)) {
            // @todo @phoenix see if we still need it
            //     restore();
            //     break;
            // }
        }
        return joinWith;
    }
    deleteRangeRemoveEmptyStart(startBlock, endBlock) {
        // If the oDeleteBackward loop emptied the start block and the range
        // ends in another element (rangeStart !== rangeEnd), we delete the
        // start block and move the cursor to the end block.
        if (
            startBlock &&
            startBlock.textContent === "\u200B" &&
            endBlock &&
            startBlock !== endBlock &&
            !isEmptyBlock(endBlock) &&
            paragraphRelatedElements.includes(endBlock.nodeName)
        ) {
            startBlock.remove();
            this.shared.setCursorStart(endBlock);
            fillEmpty(endBlock);
        }
    }
    deleteRangeRemoveZws(insertedZws) {
        if (insertedZws) {
            // Remove the zero-width space (zws) that was added to preserve
            // the parent styles, then call `fillEmpty` to properly add a
            // flagged zws if still needed.
            const el = closestElement(insertedZws);
            const next = insertedZws.nextSibling;
            insertedZws.remove();
            el && fillEmpty(el);
            if (next) {
                this.shared.setCursorStart(next);
            }
        }
    }

    deleteRangeFillJoined(joinWith) {
        if (joinWith) {
            const el = closestElement(joinWith);
            el && fillEmpty(el);
        }
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
}

/**
 * Handle text node deletion for Text.oDeleteForward and Text.oDeleteBackward.
 *
 * @param {string} element
 * @param {int} charSize
 * @param {int} offset
 * @param {DIRECTIONS} direction
 * @param {boolean} alreadyMoved
 */
function deleteText(element, charSize, offset, direction, propagate) {
    const parentElement = element.parentElement;
    // Split around the character where the deletion occurs.
    const firstSplitOffset = splitTextNode(element, offset);
    const secondSplitOffset = splitTextNode(parentElement.childNodes[firstSplitOffset], charSize);
    const middleNode = parentElement.childNodes[firstSplitOffset];

    // Do remove the character, then restore the state of the surrounding parts.
    const restore = prepareUpdate(
        parentElement,
        firstSplitOffset,
        parentElement,
        secondSplitOffset
    );
    const isSpace = isWhitespace(middleNode) && !isInPre(middleNode);
    const isZWS = middleNode.nodeValue === "\u200B";
    middleNode.remove();
    restore();

    // If the removed element was not visible content, propagate the deletion.
    if (
        isZWS ||
        (isSpace && getState(parentElement, firstSplitOffset, direction).cType !== CTYPES.CONTENT)
    ) {
        propagate({ targetNode: parentElement, targetOffset: firstSplitOffset });
        if (isZWS) {
            fillEmpty(parentElement);
        }
        return;
    }
    fillEmpty(parentElement);
    setSelection(parentElement, firstSplitOffset);
}

function isDeletable(node) {
    return isMediaElement(node) || isNotEditableNode(node);
}
// @todo @phoenix rename this function. Is it the mean the same as isDeletable?
// If so, merge it with isDeletable method and maybe rename it.
function filterFunc(node) {
    return isSelfClosingElement(node) || isVisibleTextNode(node) || isNotEditableNode(node);
}

registry.category("phoenix_plugins").add(DeletePlugin.name, DeletePlugin);
