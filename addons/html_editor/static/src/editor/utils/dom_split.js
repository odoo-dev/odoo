import { childNodeIndex, DIRECTIONS } from "./position";

/**
 * Splits a text node in two parts.
 * If the split occurs at the beginning or the end, the text node stays
 * untouched and unsplit. If a split actually occurs, the original text node
 * still exists and become the right part of the split.
 *
 * Note: if split after or before whitespace, that whitespace may become
 * invisible, it is up to the caller to replace it by nbsp if needed.
 *
 * @param {Node} textNode
 * @param {number} offset
 * @param {DIRECTIONS} originalNodeSide Whether the original node ends up on left
 * or right after the split
 * @returns {number} The parentOffset if the cursor was between the two text
 *          node parts after the split.
 */

export function splitTextNode(textNode, offset, originalNodeSide = DIRECTIONS.RIGHT) {
    const document = textNode.ownerDocument;
    let parentOffset = childNodeIndex(textNode);

    if (offset > 0) {
        parentOffset++;

        if (offset < textNode.length) {
            const left = textNode.nodeValue.substring(0, offset);
            const right = textNode.nodeValue.substring(offset);
            if (originalNodeSide === DIRECTIONS.LEFT) {
                const newTextNode = document.createTextNode(right);
                textNode.after(newTextNode);
                textNode.nodeValue = left;
            } else {
                const newTextNode = document.createTextNode(left);
                textNode.before(newTextNode);
                textNode.nodeValue = right;
            }
        }
    }
    return parentOffset;
}
/**
 * Split the given element at the given offset. The element will be removed in
 * the process so caution is advised in dealing with its reference. Returns a
 * tuple containing the new elements on both sides of the split.
 *
 * @param {Element} element
 * @param {number} offset
 * @returns {[Element, Element]}
 */

export function splitElement(element, offset) {
    const before = element.cloneNode();
    const after = element.cloneNode();
    let index = 0;
    for (const child of [...element.childNodes]) {
        index < offset ? before.appendChild(child) : after.appendChild(child);
        index++;
    }
    element.before(before);
    element.after(after);
    element.remove();
    return [before, after];
}

/**
 * Split the given element at the given offset, until the given limit ancestor.
 * The element will be removed in the process so caution is advised in dealing
 * with its reference. Returns a tuple containing the new elements on both sides
 * of the split.
 *
 * @param {Element} element
 * @param {number} offset
 * @param {Element} limitAncestor
 * @returns {[Element, Element]}
 */
export function splitElementUntil(element, offset, limitAncestor) {
    if (element === limitAncestor) {
        return [element, element];
    }
    let [before, after] = splitElement(element, offset);
    if (after.parentElement !== limitAncestor) {
        const afterIndex = childNodeIndex(after);
        [before, after] = splitElementUntil(after.parentElement, afterIndex, limitAncestor);
    }
    return [before, after];
}
/**
 * Split around the given elements, until a given ancestor (included). Elements
 * will be removed in the process so caution is advised in dealing with their
 * references. Returns the new split root element that is a clone of
 * limitAncestor or the original limitAncestor if no split occured.
 *
 * @see splitElement
 * @param {Node[] | Node} elements
 * @param {Node} limitAncestor
 * @returns {[Node, Node]}
 */

export function splitAroundUntil(elements, limitAncestor) {
    elements = Array.isArray(elements) ? elements : [elements];
    const firstNode = elements[0];
    const lastNode = elements[elements.length - 1];
    if ([firstNode, lastNode].includes(limitAncestor)) {
        return limitAncestor;
    }
    let before = firstNode.previousSibling;
    let after = lastNode.nextSibling;
    let beforeSplit, afterSplit;
    if (!before && !after && elements[0] !== limitAncestor) {
        return splitAroundUntil(elements[0].parentElement, limitAncestor);
    }
    // Split up ancestors up to font
    while (after && after.parentElement !== limitAncestor) {
        afterSplit = splitElement(after.parentElement, childNodeIndex(after))[0];
        after = afterSplit.nextSibling;
    }
    if (after) {
        afterSplit = splitElement(limitAncestor, childNodeIndex(after))[0];
        limitAncestor = afterSplit;
    }
    while (before && before.parentElement !== limitAncestor) {
        beforeSplit = splitElement(before.parentElement, childNodeIndex(before) + 1)[1];
        before = beforeSplit.previousSibling;
    }
    if (before) {
        beforeSplit = splitElement(limitAncestor, childNodeIndex(before) + 1)[1];
    }
    return beforeSplit || afterSplit || limitAncestor;
}
