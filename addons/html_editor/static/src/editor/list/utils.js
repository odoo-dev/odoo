/** @odoo-module */

import { getAdjacents } from "../utils/dom_traversal";

export function getListMode(pnode) {
    if (pnode.tagName == "OL") {
        return "OL";
    }
    return pnode.classList.contains("o_checklist") ? "CL" : "UL";
}

export function createList(mode) {
    const node = document.createElement(mode == "OL" ? "OL" : "UL");
    if (mode == "CL") {
        node.classList.add("o_checklist");
    }
    return node;
}

export function insertListAfter(afterNode, mode, content = []) {
    const list = createList(mode);
    afterNode.after(list);
    list.append(
        ...content.map((c) => {
            const li = document.createElement("LI");
            li.append(...[].concat(c));
            return li;
        })
    );
    return list;
}

/**
 * Merges similar siblings of an element based on a compare function.
 *
 * @param {HTMLElement} element
 * @param {Function} compare
 * @returns {HTMLElement}
 */
function mergeSimilarSiblings(element, compare) {
    const adjacentElements = getAdjacents(element, (n) => compare(element, n));
    const dest = adjacentElements.shift();
    while (adjacentElements.length) {
        const src = adjacentElements.shift();
        dest.append(...src.childNodes);
        src.remove();
    }
    return dest;
}

/* Returns true if the two lists are of the same type among:
 * - OL
 * - regular UL
 * - checklist (ul.o_checklist)
 * - container for nested lists (li.oe-nested)
 */
function compareListTypes(a, b) {
    if (a.tagName !== b.tagName) {
        return false;
    }
    if (a.classList.contains("o_checklist") !== b.classList.contains("o_checklist")) {
        return false;
    }
    if (a.tagName === "LI") {
        if (a.classList.contains("oe-nested") !== b.classList.contains("oe-nested")) {
            return false;
        }
        return compareListTypes(a.firstElementChild, b.firstElementChild);
    }
    return true;
}

/**
 * Merges a list with its similar siblings.
 * Children nested lists are also merged.
 *
 * @param {HTMLElement} list
 */
export function mergeListDeep(list) {
    if (!list.matches("ul, ol, li.oe-nested")) {
        return list;
    }
    // Merge list with similar siblings.
    const mergedList = mergeSimilarSiblings(list, compareListTypes);
    // Same for the children of the resulting list (depth-first).
    let nextChildList = mergedList.firstElementChild;
    while (nextChildList) {
        const mergedChildList = mergeListDeep(nextChildList);
        nextChildList = mergedChildList.nextElementSibling;
    }
    return mergedList;
}
