/** @odoo-module */

import { DIRECTIONS } from "./position";

export const closestPath = function* (node) {
    while (node) {
        yield node;
        node = node.parentNode;
    }
};

/**
 * Find a node.
 * @param {findCallback} findCallback - This callback check if this function
 *      should return `node`.
 * @param {findCallback} stopCallback - This callback check if this function
 *      should stop when it receive `node`.
 */
export function findNode(domPath, findCallback = () => true, stopCallback = () => false) {
    for (const node of domPath) {
        if (findCallback(node)) {
            return node;
        }
        if (stopCallback(node)) {
            break;
        }
    }
    return null;
}

/**
 * Returns the closest HTMLElement of the provided Node. If the predicate is a
 * string, returns the closest HTMLElement that match the predicate selector. If
 * the predicate is a function, returns the closest element that matches the
 * predicate. Any returned element will be contained within the editable.
 *
 * @param {Node} node
 * @param {string | Function} [predicate='*']
 * @returns {HTMLElement|null}
 */
export function closestElement(node, predicate = "*") {
    if (!node) {
        return null;
    }
    let element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    if (typeof predicate === "function") {
        while (element && !predicate(element)) {
            element = element.parentElement;
        }
    } else {
        element = element?.closest(predicate);
    }

    return element?.closest(".odoo-editor-editable") && element;
}

/**
 * Returns a list of all the ancestors nodes of the provided node.
 *
 * @param {Node} node
 * @param {Node} [editable] include to prevent bubbling up further than the editable.
 * @returns {HTMLElement[]}
 */
export function ancestors(node, editable) {
    if (!node || !node.parentElement || node === editable) {
        return [];
    }
    return [node.parentElement, ...ancestors(node.parentElement, editable)];
}

/**
 * Take a node, return all of its descendants, in depth-first order.
 *
 * @param {Node} node
 * @returns {Node[]}
 */
export function descendants(node) {
    const posterity = [];
    for (const child of node.childNodes || []) {
        posterity.push(child, ...descendants(child));
    }
    return posterity;
}

/**
 * Values which can be returned while browsing the DOM which gives information
 * to why the path ended.
 */
export const PATH_END_REASONS = {
    NO_NODE: 0,
    BLOCK_OUT: 1,
    BLOCK_HIT: 2,
    OUT_OF_SCOPE: 3,
};

/**
 * Creates a generator function according to the given parameters. Pre-made
 * generators to traverse the DOM are made using this function:
 *
 * @see leftLeafFirstPath
 * @see leftLeafOnlyNotBlockPath
 * @see leftLeafOnlyInScopeNotBlockEditablePath
 * @see rightLeafOnlyNotBlockPath
 * @see rightLeafOnlyPathNotBlockNotEditablePath
 * @see rightLeafOnlyInScopeNotBlockEditablePath
 * @see rightLeafOnlyNotBlockNotEditablePath
 *
 * @param {number} direction
 * @param {boolean} [options.leafOnly] if true, do not yield any non-leaf node
 * @param {boolean} [options.inScope] if true, stop the generator as soon as a node is not
 *                      a descendant of `node` provided when traversing the
 *                      generated function.
 * @param {Function} [options.stopTraverseFunction] a function that takes a node
 *                      and should return true when a node descendant should not
 *                      be traversed.
 * @param {Function} [options.stopFunction] function that makes the generator stop when a
 *                      node is encountered.
 */
export function createDOMPathGenerator(
    direction,
    { leafOnly = false, inScope = false, stopTraverseFunction, stopFunction } = {}
) {
    const nextDeepest =
        direction === DIRECTIONS.LEFT
            ? (node) => lastLeaf(node.previousSibling, stopTraverseFunction)
            : (node) => firstLeaf(node.nextSibling, stopTraverseFunction);

    const firstNode =
        direction === DIRECTIONS.LEFT
            ? (node, offset) => lastLeaf(node.childNodes[offset - 1], stopTraverseFunction)
            : (node, offset) => firstLeaf(node.childNodes[offset], stopTraverseFunction);

    // Note "reasons" is a way for the caller to be able to know why the
    // generator ended yielding values.
    return function* (node, offset, reasons = []) {
        let movedUp = false;

        let currentNode = firstNode(node, offset);
        if (!currentNode) {
            movedUp = true;
            currentNode = node;
        }

        while (currentNode) {
            if (stopFunction && stopFunction(currentNode)) {
                reasons.push(movedUp ? PATH_END_REASONS.BLOCK_OUT : PATH_END_REASONS.BLOCK_HIT);
                break;
            }
            if (inScope && currentNode === node) {
                reasons.push(PATH_END_REASONS.OUT_OF_SCOPE);
                break;
            }
            if (!(leafOnly && movedUp)) {
                yield currentNode;
            }

            movedUp = false;
            let nextNode = nextDeepest(currentNode);
            if (!nextNode) {
                movedUp = true;
                nextNode = currentNode.parentNode;
            }
            currentNode = nextNode;
        }

        reasons.push(PATH_END_REASONS.NO_NODE);
    };
}

/**
 * Returns the deepest child in last position.
 *
 * @param {Node} node
 * @param {Function} [stopTraverseFunction]
 * @returns {Node}
 */
export function lastLeaf(node, stopTraverseFunction) {
    while (node && node.lastChild && !(stopTraverseFunction && stopTraverseFunction(node))) {
        node = node.lastChild;
    }
    return node;
}
/**
 * Returns the deepest child in first position.
 *
 * @param {Node} node
 * @param {Function} [stopTraverseFunction]
 * @returns {Node}
 */
export function firstLeaf(node, stopTraverseFunction) {
    while (node && node.firstChild && !(stopTraverseFunction && stopTraverseFunction(node))) {
        node = node.firstChild;
    }
    return node;
}
