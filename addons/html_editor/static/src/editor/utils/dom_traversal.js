/** @odoo-module */

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
