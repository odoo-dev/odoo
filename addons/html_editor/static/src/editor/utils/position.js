/** @odoo-module */
// Position and sizes
//------------------------------------------------------------------------------

export const DIRECTIONS = {
    LEFT: false,
    RIGHT: true,
};

/**
 * @param {Node} node
 * @returns {Array.<HTMLElement, number>}
 */
export function leftPos(node) {
    return [node.parentNode, childNodeIndex(node)];
}
/**
 * @param {Node} node
 * @returns {Array.<HTMLElement, number>}
 */
export function rightPos(node) {
    return [node.parentNode, childNodeIndex(node) + 1];
}
/**
 * @param {Node} node
 * @returns {Array.<HTMLElement, number, HTMLElement, number>}
 */
export function boundariesOut(node) {
    const index = childNodeIndex(node);
    return [node.parentNode, index, node.parentNode, index + 1];
}
/**
 * @param {Node} node
 * @returns {Array.<Node, number>}
 */
export function startPos(node) {
    return [node, 0];
}
/**
 * @param {Node} node
 * @returns {Array.<Node, number>}
 */
export function endPos(node) {
    return [node, nodeSize(node)];
}
/**
 * Returns the given node's position relative to its parent (= its index in the
 * child nodes of its parent).
 *
 * @param {Node} node
 * @returns {number}
 */
export function childNodeIndex(node) {
    let i = 0;
    while (node.previousSibling) {
        i++;
        node = node.previousSibling;
    }
    return i;
}
/**
 * Returns the size of the node = the number of characters for text nodes and
 * the number of child nodes for element nodes.
 *
 * @param {Node} node
 * @returns {number}
 */
export function nodeSize(node) {
    const isTextNode = node.nodeType === Node.TEXT_NODE;
    return isTextNode ? node.length : node.childNodes.length;
}
