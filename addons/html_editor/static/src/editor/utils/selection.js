/** @odoo-module */

import { isBlock } from "./blocks";
import { isNotEditableNode, isSelfClosingElement } from "./dom_info";
import { isFakeLineBreak } from "./dom_state";
import { closestElement, createDOMPathGenerator } from "./dom_traversal";
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
