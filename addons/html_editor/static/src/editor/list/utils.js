import { unwrapContents } from "../utils/dom";
import { getAdjacents } from "../utils/dom_traversal";
import { preserveCursor } from "../utils/selection";

export function getListMode(pnode) {
    if (pnode.tagName == "OL") {
        return "OL";
    }
    return pnode.classList.contains("o_checklist") ? "CL" : "UL";
}

export function createList(document, mode) {
    const node = document.createElement(mode == "OL" ? "OL" : "UL");
    if (mode == "CL") {
        node.classList.add("o_checklist");
    }
    return node;
}

// @todo use the correct document
export function insertListAfter(document, afterNode, mode, content = []) {
    const list = createList(document, mode);
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

// @todo @phoenix: use the selection plugin to preserve the cursor
export function mergeSimilarLists(element) {
    if (!element.matches("ul, ol, li.oe-nested")) {
        return element;
    }
    const restoreCursor = preserveCursor(element.ownerDocument);
    const mergedList = mergeSimilarSiblings(element, compareListTypes);
    restoreCursor();
    return mergedList;
}

// @todo @phoenix: use the selection plugin to preserve the cursor
// @todo @phoenix: wrap P in a span if P has classes (mind the oe-hint class)
export function unwrapParagraphInLI(element) {
    if (!element.matches("li > p")) {
        return element;
    }
    const parentLI = element.parentElement;
    const restoreCursor = preserveCursor(element.ownerDocument);
    const contents = unwrapContents(element);
    restoreCursor(new Map([element, parentLI]));
    // This assumes an empty P has at least one child (BR).
    return contents[0];
}

export function applyToTree(root, func) {
    const modifiedRoot = func(root);
    let next = modifiedRoot.firstElementChild;
    while (next) {
        const modifiedNext = applyToTree(next, func);
        next = modifiedNext.nextElementSibling;
    }
    return modifiedRoot;
}
