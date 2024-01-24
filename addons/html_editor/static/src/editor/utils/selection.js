/** @odoo-module */

import { isBlock } from "./blocks";
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

export function getInSelection(document, selector) {
    const selection = document.getSelection();
    const range = selection && !!selection.rangeCount && selection.getRangeAt(0);
    if (range) {
        const selectorInStartAncestors = closestElement(range.startContainer, selector);
        if (selectorInStartAncestors) {
            return selectorInStartAncestors;
        } else {
            const commonElementAncestor = closestElement(range.commonAncestorContainer);
            return (
                commonElementAncestor &&
                [...commonElementAncestor.querySelectorAll(selector)].find((node) =>
                    range.intersectsNode(node)
                )
            );
        }
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

/**
 * From a given position, returns the normalized version.
 *
 * E.g. <b>abc</b>[]def -> <b>abc[]</b>def
 *
 * @param {Node} node
 * @param {number} offset
 * @param {boolean} [full=true] (if not full, it means we only normalize
 *     positions which are not possible, like the cursor inside an image).
 */
export function getNormalizedCursorPosition(node, offset, full = true) {
    const editable = closestElement(node, ".odoo-editor-editable");
    let closest = closestElement(node);
    while (
        closest &&
        closest !== editable &&
        (isSelfClosingElement(node) || !closest.isContentEditable)
    ) {
        // Cannot put the cursor inside those elements, put it before if the
        // offset is 0 and the node is not empty, else after instead.
        [node, offset] = offset || !nodeSize(node) ? rightPos(node) : leftPos(node);
        closest = closestElement(node);
    }

    // Be permissive about the received offset.
    offset = Math.min(Math.max(offset, 0), nodeSize(node));

    if (full) {
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
            const leftInlineNode = leftLeafOnlyInScopeNotBlockEditablePath(el, elOffset).next()
                .value;
            let leftVisibleEmpty = false;
            if (leftInlineNode) {
                leftVisibleEmpty =
                    isSelfClosingElement(leftInlineNode) ||
                    !closestElement(leftInlineNode).isContentEditable;
                [node, offset] = leftVisibleEmpty
                    ? rightPos(leftInlineNode)
                    : endPos(leftInlineNode);
            }
            if (!leftInlineNode || leftVisibleEmpty) {
                const rightInlineNode = rightLeafOnlyInScopeNotBlockEditablePath(
                    el,
                    elOffset
                ).next().value;
                if (rightInlineNode) {
                    const closest = closestElement(rightInlineNode);
                    const rightVisibleEmpty =
                        isSelfClosingElement(rightInlineNode) ||
                        !closest ||
                        !closest.isContentEditable;
                    if (!(leftVisibleEmpty && rightVisibleEmpty)) {
                        [node, offset] = rightVisibleEmpty
                            ? leftPos(rightInlineNode)
                            : startPos(rightInlineNode);
                    }
                }
            }
        }
    }
    const prevNode = node.nodeType === Node.ELEMENT_NODE && node.childNodes[offset - 1];
    if (prevNode && prevNode.nodeName === "BR" && isFakeLineBreak(prevNode)) {
        // If trying to put the cursor on the right of a fake line break, put
        // it before instead.
        offset--;
    }

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
    range = range ? range.cloneRange() : sel && sel.rangeCount && sel.getRangeAt(0).cloneRange();
    if (!range) {
        return;
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

/**
 * Returns an array containing all the nodes traversed when walking the
 * selection.
 *
 * @param {Node} editable
 * @returns {Node[]}
 */
export function getTraversedNodes(editable, range = getDeepRange(editable)) {
    const selectedTableCells = editable.querySelectorAll(".o_selected_td");
    const document = editable.ownerDocument;
    if (!range) {
        return [];
    }
    const iterator = document.createNodeIterator(range.commonAncestorContainer);
    let node;
    do {
        node = iterator.nextNode();
    } while (
        node &&
        node !== range.startContainer &&
        !(selectedTableCells.length && node === selectedTableCells[0])
    );
    const traversedNodes = new Set([node, ...descendants(node)]);
    while (node && node !== range.endContainer) {
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
 * Returns an array containing all the nodes fully contained in the selection.
 *
 * @param {Node} editable
 * @returns {Node[]}
 */
export function getSelectedNodes(editable) {
    const selectedTableCells = editable.querySelectorAll(".o_selected_td");
    const document = editable.ownerDocument;
    const sel = document.getSelection();
    if (!sel.rangeCount && !selectedTableCells.length) {
        return [];
    }
    const range = sel.getRangeAt(0);
    return [
        ...new Set(
            getTraversedNodes(editable).flatMap((node) => {
                const td = closestElement(node, ".o_selected_td");
                if (td) {
                    return descendants(td);
                } else if (
                    range.isPointInRange(node, 0) &&
                    range.isPointInRange(node, nodeSize(node))
                ) {
                    return node;
                } else {
                    return [];
                }
            })
        ),
    ];
}

export function preserveCursor(document) {
    const sel = document.getSelection();
    const cursorPos = [sel.anchorNode, sel.anchorOffset, sel.focusNode, sel.focusOffset];
    return (replace) => {
        replace = replace || new Map();
        cursorPos[0] = replace.get(cursorPos[0]) || cursorPos[0];
        cursorPos[2] = replace.get(cursorPos[2]) || cursorPos[2];
        return setSelection(...cursorPos, false);
    };
}
