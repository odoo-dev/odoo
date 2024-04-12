import { closestBlock, isBlock } from "./blocks";
import { splitTextNode } from "./dom_split";
import {
    getDeepestPosition,
    isNotEditableNode,
    isSelfClosingElement,
    isVisibleTextNode,
    isZWS,
    previousLeaf,
} from "./dom_info";
import { isFakeLineBreak } from "./dom_state";
import { closestElement, createDOMPathGenerator, descendants, firstLeaf } from "./dom_traversal";
import {
    DIRECTIONS,
    childNodeIndex,
    endPos,
    leftPos,
    nodeSize,
    rightPos,
    startPos,
} from "./position";

/**
 * From selection position, checks if it is left-to-right or right-to-left.
 *
 * @param {Node} anchorNode
 * @param {number} anchorOffset
 * @param {Node} focusNode
 * @param {number} focusOffset
 * @returns {boolean} the direction of the current range if the selection not is collapsed | false
 */
export function getCursorDirection(anchorNode, anchorOffset, focusNode, focusOffset) {
    if (anchorNode === focusNode) {
        if (anchorOffset === focusOffset) {
            return false;
        }
        return anchorOffset < focusOffset ? DIRECTIONS.RIGHT : DIRECTIONS.LEFT;
    }
    return anchorNode.compareDocumentPosition(focusNode) & Node.DOCUMENT_POSITION_FOLLOWING
        ? DIRECTIONS.RIGHT
        : DIRECTIONS.LEFT;
}

export function findInSelection(selection, selector) {
    const selectorInStartAncestors = closestElement(selection.startContainer, selector);
    if (selectorInStartAncestors) {
        return selectorInStartAncestors;
    } else {
        const commonElementAncestor = closestElement(selection.commonAncestorContainer);
        return (
            commonElementAncestor &&
            [...commonElementAncestor.querySelectorAll(selector)].find((node) =>
                selection.commonAncestorContainer.contains(node)
            )
        );
    }
}

const leftLeafOnlyInScopeNotBlockEditablePath = createDOMPathGenerator(DIRECTIONS.LEFT, {
    leafOnly: true,
    inScope: true,
    stopTraverseFunction: (node) => isNotEditableNode(node) || isBlock(node),
    stopFunction: (node) => isNotEditableNode(node) || isBlock(node),
});

const rightLeafOnlyInScopeNotBlockEditablePath = createDOMPathGenerator(DIRECTIONS.RIGHT, {
    leafOnly: true,
    inScope: true,
    stopTraverseFunction: (node) => isNotEditableNode(node) || isBlock(node),
    stopFunction: (node) => isNotEditableNode(node) || isBlock(node),
});

export function normalizeSelfClosingElement(node, offset) {
    if (isSelfClosingElement(node)) {
        // Cannot put cursor inside those elements, put it after instead.
        [node, offset] = rightPos(node);
    }
    return [node, offset];
}

export function normalizeNotEditableNode(node, offset, position = "right") {
    const editable = closestElement(node, ".odoo-editor-editable");
    let closest = closestElement(node);
    while (closest && closest !== editable && !closest.isContentEditable) {
        [node, offset] = position === "right" ? rightPos(node) : leftPos(node);
        closest = closestElement(node);
    }
    return [node, offset];
}

export function normalizeCursorPosition(node, offset, position = "right") {
    [node, offset] = normalizeSelfClosingElement(node, offset);
    [node, offset] = normalizeNotEditableNode(node, offset, position);
    // todo @phoenix: we should maybe remove it
    // // Be permissive about the received offset.
    // offset = Math.min(Math.max(offset, 0), nodeSize(node));
    return [node, offset];
}

export function normalizeFakeBR(node, offset) {
    const prevNode = node.nodeType === Node.ELEMENT_NODE && node.childNodes[offset - 1];
    if (prevNode && prevNode.nodeName === "BR" && isFakeLineBreak(prevNode)) {
        // If trying to put the cursor on the right of a fake line break, put
        // it before instead.
        offset--;
    }
    return [node, offset];
}

/**
 * From a given position, returns the normalized version.
 *
 * E.g. <b>abc</b>[]def -> <b>abc[]</b>def
 *
 * @param {Node} node
 * @param {number} offset
 */
export function normalizeDeepCursorPosition(node, offset) {
    // Put the cursor in deepest inline node around the given position if
    // possible.
    let el;
    let elOffset;
    if (node.nodeType === Node.ELEMENT_NODE) {
        el = node;
        elOffset = offset;
    } else if (node.nodeType === Node.TEXT_NODE) {
        if (offset === 0) {
            el = node.parentNode;
            elOffset = childNodeIndex(node);
        } else if (offset === node.length) {
            el = node.parentNode;
            elOffset = childNodeIndex(node) + 1;
        }
    }
    if (el) {
        const leftInlineNode = leftLeafOnlyInScopeNotBlockEditablePath(el, elOffset).next().value;
        let leftVisibleEmpty = false;
        if (leftInlineNode) {
            leftVisibleEmpty =
                isSelfClosingElement(leftInlineNode) ||
                !closestElement(leftInlineNode).isContentEditable;
            [node, offset] = leftVisibleEmpty ? rightPos(leftInlineNode) : endPos(leftInlineNode);
        }
        if (!leftInlineNode || leftVisibleEmpty) {
            const rightInlineNode = rightLeafOnlyInScopeNotBlockEditablePath(el, elOffset).next()
                .value;
            if (rightInlineNode) {
                const closest = closestElement(rightInlineNode);
                const rightVisibleEmpty =
                    isSelfClosingElement(rightInlineNode) || !closest || !closest.isContentEditable;
                if (!(leftVisibleEmpty && rightVisibleEmpty)) {
                    [node, offset] = rightVisibleEmpty
                        ? leftPos(rightInlineNode)
                        : startPos(rightInlineNode);
                }
            }
        }
    }
    return [node, offset];
}

// todo @phoenix: remove with legacy setSelection
export function getNormalizedCursorPosition(node, offset, deep = true) {
    [node, offset] = normalizeCursorPosition(node, offset, "left");
    if (deep) {
        [node, offset] = normalizeDeepCursorPosition(node, offset);
    }
    [node, offset] = normalizeFakeBR(node, offset);
    return [node, offset];
}

/**
 * @param {Node} anchorNode
 * @param {number} anchorOffset
 * @param {Node} focusNode
 * @param {number} focusOffset
 * @param {boolean} [normalize=true]
 * @returns {?Array.<Node, number}
 */
export function setSelection(
    anchorNode,
    anchorOffset,
    focusNode = anchorNode,
    focusOffset = anchorOffset,
    normalize = true
) {
    if (
        !anchorNode ||
        !anchorNode.parentElement ||
        !anchorNode.parentElement.closest("body") ||
        !focusNode ||
        !focusNode.parentElement ||
        !focusNode.parentElement.closest("body")
    ) {
        return null;
    }
    const document = anchorNode.ownerDocument;

    const seemsCollapsed = anchorNode === focusNode && anchorOffset === focusOffset;
    [anchorNode, anchorOffset] = getNormalizedCursorPosition(anchorNode, anchorOffset, normalize);
    [focusNode, focusOffset] = seemsCollapsed
        ? [anchorNode, anchorOffset]
        : getNormalizedCursorPosition(focusNode, focusOffset, normalize);

    const direction = getCursorDirection(anchorNode, anchorOffset, focusNode, focusOffset);
    const sel = document.getSelection();
    if (!sel) {
        return null;
    }
    try {
        const range = new Range();
        if (direction === DIRECTIONS.RIGHT) {
            range.setStart(anchorNode, anchorOffset);
            range.collapse(true);
        } else {
            range.setEnd(anchorNode, anchorOffset);
            range.collapse(false);
        }
        sel.removeAllRanges();
        sel.addRange(range);
        sel.extend(focusNode, focusOffset);
    } catch (e) {
        // Firefox throws NS_ERROR_FAILURE when setting selection on element
        // with contentEditable=false for no valid reason since non-editable
        // content are selectable by the user anyway.
        if (e.name !== "NS_ERROR_FAILURE") {
            throw e;
        }
    }

    return [anchorNode, anchorOffset, focusNode, focusOffset];
}

/**
 * @param {Node} node
 * @param {boolean} [normalize=true]
 * @returns {?Array.<Node, number}
 */
export function setCursorStart(node, normalize = true) {
    const pos = startPos(node);
    return setSelection(...pos, ...pos, normalize);
}
/**
 * @param {Node} node
 * @param {boolean} [normalize=true]
 * @returns {?Array.<Node, number}
 */
export function setCursorEnd(node, normalize = true) {
    const pos = endPos(node);
    return setSelection(...pos, ...pos, normalize);
}

/**
 * Returns the current range (if any), adapted to target the deepest
 * descendants.
 *
 * @param {Node} editable
 * @param {object} [options]
 * @param {Selection} [options.range] the range to use.
 * @param {Selection} [options.sel] the selection to use.
 * @param {boolean} [options.splitText] split the targeted text nodes at offset.
 * @param {boolean} [options.select] select the new range if it changed (via splitText).
 * @param {boolean} [options.correctTripleClick] adapt the range if it was a triple click.
 * @returns {Range}
 */
export function getDeepRange(editable, { range, sel, splitText, select, correctTripleClick } = {}) {
    sel = sel || (editable.parentElement && editable.ownerDocument.getSelection());
    if (sel && sel.isCollapsed && sel.anchorNode && sel.anchorNode.nodeName === "BR") {
        setCursorStart(sel.anchorNode.parentElement, false);
    }
    if (!range) {
        if (sel.rangeCount) {
            range = sel.getRangeAt(0).cloneRange();
        } else {
            range = new Range();
            range.setStart(sel.startContainer, sel.startOffset);
            range.setEnd(sel.endContainer, sel.endOffset);
        }
    }

    let start = range.startContainer;
    let startOffset = range.startOffset;
    let end = range.endContainer;
    let endOffset = range.endOffset;

    const isBackwards =
        !range.collapsed && start === sel.focusNode && startOffset === sel.focusOffset;

    // Target the deepest descendant of the range nodes.
    [start, startOffset] = getDeepestPosition(start, startOffset);
    [end, endOffset] = getDeepestPosition(end, endOffset);

    // Split text nodes if that was requested.
    if (splitText) {
        const isInSingleContainer = start === end;
        if (
            end.nodeType === Node.TEXT_NODE &&
            endOffset !== 0 &&
            endOffset !== end.textContent.length
        ) {
            const endParent = end.parentNode;
            const splitOffset = splitTextNode(end, endOffset);
            end = endParent.childNodes[splitOffset - 1] || endParent.firstChild;
            if (isInSingleContainer) {
                start = end;
            }
            endOffset = end.textContent.length;
        }
        if (
            start.nodeType === Node.TEXT_NODE &&
            startOffset !== 0 &&
            startOffset !== start.textContent.length
        ) {
            splitTextNode(start, startOffset);
            startOffset = 0;
            if (isInSingleContainer) {
                endOffset = start.textContent.length;
            }
        }
    }

    // A selection spanning multiple nodes and ending at position 0 of a node,
    // like the one resulting from a triple click, is corrected so that it ends
    // at the last position of the previous node instead.
    const endLeaf = firstLeaf(end);
    const beforeEnd = endLeaf.previousSibling;
    if (
        correctTripleClick &&
        !endOffset &&
        (start !== end || startOffset !== endOffset) &&
        (!beforeEnd ||
            (beforeEnd.nodeType === Node.TEXT_NODE &&
                !isVisibleTextNode(beforeEnd) &&
                !isZWS(beforeEnd)))
    ) {
        const previous = previousLeaf(endLeaf, editable, true);
        if (previous && closestElement(previous).isContentEditable) {
            [end, endOffset] = [previous, nodeSize(previous)];
        }
    }

    if (select) {
        if (isBackwards) {
            [start, end, startOffset, endOffset] = [end, start, endOffset, startOffset];
            range.setEnd(start, startOffset);
            range.collapse(false);
        } else {
            range.setStart(start, startOffset);
            range.collapse(true);
        }
        sel.removeAllRanges();
        sel.addRange(range);
        try {
            sel.extend(end, endOffset);
        } catch {
            // Firefox yells not happy when setting selection on elem with contentEditable=false.
        }
        range = sel.getRangeAt(0);
    } else {
        range.setStart(start, startOffset);
        range.setEnd(end, endOffset);
    }
    return range;
}

// @todo @phoenix: remove table logic from this util
/**
 * Returns an array containing all the nodes traversed when walking the
 * selection.
 *
 * @param {Node} editable
 * @param {Selection} selection
 * @returns {Node[]}
 */
export function getTraversedNodes(editable, selection) {
    const selectedTableCells = editable.querySelectorAll(".o_selected_td");
    const document = editable.ownerDocument;
    const iterator = document.createNodeIterator(selection.commonAncestorContainer);
    let node;
    do {
        node = iterator.nextNode();
    } while (
        node &&
        node !== selection.startContainer &&
        !(selectedTableCells.length && node === selectedTableCells[0])
    );
    const traversedNodes = new Set([node, ...descendants(node)]);
    while (node && node !== selection.endContainer) {
        node = iterator.nextNode();
        if (node) {
            const selectedTable = closestElement(node, ".o_selected_table");
            if (selectedTable) {
                for (const selectedTd of selectedTable.querySelectorAll(".o_selected_td")) {
                    traversedNodes.add(selectedTd);
                    descendants(selectedTd).forEach((descendant) => traversedNodes.add(descendant));
                }
            } else {
                traversedNodes.add(node);
            }
        }
    }
    return [...traversedNodes];
}

/**
 * Returns a Set of traversed blocks within the given range.
 *
 * @param {HTMLElement} editable
 * @param {Range} [range=getDeepRange(editable)]
 * @returns {Set<HTMLElement>}
 */
export function getTraversedBlocks(editable, range = getDeepRange(editable)) {
    return new Set(getTraversedNodes(editable, range).map(closestBlock).filter(Boolean));
}
