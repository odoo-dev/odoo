/** @odoo-module */

import { DIRECTIONS } from "./position";
import { closestElement } from "./dom_traversal";

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
