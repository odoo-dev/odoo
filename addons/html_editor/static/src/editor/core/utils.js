/** @odoo-module */

import { isBlock } from "../utils/blocks";
import { splitElement, splitTextNode } from "../utils/dom";
import {
    hasClass,
    isBold,
    isDirectionSwitched,
    isFontSize,
    isInPre,
    isItalic,
    isSelfClosingElement,
    isStrikeThrough,
    isUnderline,
    isVisible,
    isVisibleTextNode,
    isWhitespace,
    isZWS,
    whitespace,
} from "../utils/dom_info";
import { ancestors, closestElement, closestPath, descendants } from "../utils/dom_traversal";
import {
    DIRECTIONS,
    boundariesOut,
    childNodeIndex,
    endPos,
    leftPos,
    nodeSize,
    rightPos,
    startPos,
} from "../utils/position";

export const CTYPES = {
    // Short for CONTENT_TYPES
    // Inline group
    CONTENT: 1,
    SPACE: 2,

    // Block group
    BLOCK_OUTSIDE: 4,
    BLOCK_INSIDE: 8,

    // Br group
    BR: 16,
};
export function ctypeToString(ctype) {
    return Object.keys(CTYPES).find((key) => CTYPES[key] === ctype);
}
export const CTGROUPS = {
    // Short for CONTENT_TYPE_GROUPS
    INLINE: CTYPES.CONTENT | CTYPES.SPACE,
    BLOCK: CTYPES.BLOCK_OUTSIDE | CTYPES.BLOCK_INSIDE,
    BR: CTYPES.BR,
};

/**
 * Array of all the classes used by the editor to change the font size.
 */
export const FONT_SIZE_CLASSES = ["display-1-fs", "display-2-fs", "display-3-fs", "display-4-fs", "h1-fs",
    "h2-fs", "h3-fs", "h4-fs", "h5-fs", "h6-fs", "base-fs", "small"];

export function isEmpty(el) {
    const content = el.innerHTML.trim();
    if (content === "" || content === "<br>") {
        return true;
    }
    return false;
}

export function getCurrentRect() {
    const range = getSelection().getRangeAt(0);
    let rect = range.getBoundingClientRect();
    if (rect.x === 0 && rect.width === 0 && rect.height === 0) {
        const clonedRange = range.cloneRange();
        const shadowCaret = document.createTextNode("|");
        clonedRange.insertNode(shadowCaret);
        clonedRange.selectNode(shadowCaret);
        rect = clonedRange.getBoundingClientRect();
        shadowCaret.remove();
        clonedRange.detach();
    }
    return rect;
}

export function parseHTML(document, html) {
    const fragment = document.createDocumentFragment();
    const parser = new DOMParser();
    const parsedDocument = parser.parseFromString(html, "text/html");
    fragment.replaceChildren(...parsedDocument.body.childNodes);
    return fragment;
}

export function initElementForEdition(element, options = {}) {
    // Detect if the editable base element contain orphan inline nodes. If
    // so we transform the base element HTML to put those orphans inside
    // `<p>` containers.
    const orphanInlineChildNodes = [...element.childNodes].find(
        (n) => !isBlock(n) && (n.nodeType === Node.ELEMENT_NODE || n.textContent.trim() !== "")
    );
    if (orphanInlineChildNodes && !options.allowInlineAtRoot) {
        const childNodes = [...element.childNodes];
        const tempEl = document.createElement("temp-container");
        let currentP = document.createElement("p");
        currentP.style.marginBottom = "0";
        do {
            const node = childNodes.shift();
            const nodeIsBlock = isBlock(node);
            const nodeIsBR = node.nodeName === "BR";
            // Append to the P unless child is block or an unneeded BR.
            if (!(nodeIsBlock || (nodeIsBR && currentP.childNodes.length))) {
                currentP.append(node);
            }
            // Break paragraphs on blocks and BR.
            if (nodeIsBlock || nodeIsBR || childNodes.length === 0) {
                // Ensure we don't add an empty P or a P containing only
                // formating spaces that should not be visible.
                if (currentP.childNodes.length && currentP.innerHTML.trim() !== "") {
                    tempEl.append(currentP);
                }
                currentP = currentP.cloneNode();
                // Append block children directly to the template.
                if (nodeIsBlock) {
                    tempEl.append(node);
                }
            }
        } while (childNodes.length);
        element.replaceChildren(...tempEl.childNodes);
    }
}



/**
 * Values which can be returned while browsing the DOM which gives information
 * to why the path ended.
 */
const PATH_END_REASONS = {
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
    { leafOnly = false, inScope = false, stopTraverseFunction, stopFunction } = {},
) {
    const nextDeepest =
        direction === DIRECTIONS.LEFT
            ? node => lastLeaf(node.previousSibling, stopTraverseFunction)
            : node => firstLeaf(node.nextSibling, stopTraverseFunction);

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

export const isNotEditableNode = node =>
    node.getAttribute &&
    node.getAttribute('contenteditable') &&
    node.getAttribute('contenteditable').toLowerCase() === 'false';

export const leftLeafFirstPath = createDOMPathGenerator(DIRECTIONS.LEFT);
export const leftLeafOnlyNotBlockPath = createDOMPathGenerator(DIRECTIONS.LEFT, {
    leafOnly: true,
    stopTraverseFunction: isBlock,
    stopFunction: isBlock,
});
export const leftLeafOnlyInScopeNotBlockEditablePath = createDOMPathGenerator(DIRECTIONS.LEFT, {
    leafOnly: true,
    inScope: true,
    stopTraverseFunction: node => isNotEditableNode(node) || isBlock(node),
    stopFunction: node => isNotEditableNode(node) || isBlock(node),
});

export const rightLeafOnlyNotBlockPath = createDOMPathGenerator(DIRECTIONS.RIGHT, {
    leafOnly: true,
    stopTraverseFunction: isBlock,
    stopFunction: isBlock,
});

export const rightLeafOnlyPathNotBlockNotEditablePath = createDOMPathGenerator(DIRECTIONS.RIGHT, {
    leafOnly: true,
});
export const rightLeafOnlyInScopeNotBlockEditablePath = createDOMPathGenerator(DIRECTIONS.RIGHT, {
    leafOnly: true,
    inScope: true,
    stopTraverseFunction: node => isNotEditableNode(node) || isBlock(node),
    stopFunction: node => isNotEditableNode(node) || isBlock(node),
});
export const rightLeafOnlyNotBlockNotEditablePath = createDOMPathGenerator(DIRECTIONS.RIGHT, {
    leafOnly: true,
    stopTraverseFunction: node => isNotEditableNode(node) || isBlock(node),
    stopFunction: node => isBlock(node) && !isNotEditableNode(node),
});

// DOM Path and node search functions
//------------------------------------------------------------------------------

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
export function previousLeaf(node, editable, skipInvisible = false) {
    let ancestor = node;
    while (ancestor && !ancestor.previousSibling && ancestor !== editable) {
        ancestor = ancestor.parentElement;
    }
    if (ancestor && ancestor !== editable) {
        if (skipInvisible && !isVisible(ancestor.previousSibling)) {
            return previousLeaf(ancestor.previousSibling, editable, skipInvisible);
        } else {
            const last = lastLeaf(ancestor.previousSibling);
            if (skipInvisible && !isVisible(last)) {
                return previousLeaf(last, editable, skipInvisible);
            } else {
                return last;
            }
        }
    }
}

// DOM Info utils
//------------------------------------------------------------------------------

/**
 * Return true if the current selection on the editable appears as the given
 * format. The selection is considered to appear as that format if every text
 * node in it appears as that format.
 *
 * @param {Element} editable
 * @param {String} format 'bold'|'italic'|'underline'|'strikeThrough'|'switchDirection'
 * @returns {boolean}
 */
export function isSelectionFormat(editable, format) {
    const selectedNodes = getTraversedNodes(editable)
        .filter(n => n.nodeType === Node.TEXT_NODE && n.nodeValue.trim().length);
    const isFormatted = formatsSpecs[format].isFormatted;
    return selectedNodes && selectedNodes.every(n => isFormatted(n, editable));
}


/**
 * Returns whether or not the given node is a BR element which does not really
 * act as a line break, but as a placeholder for the cursor or to make some left
 * element (like a space) visible.
 *
 * @param {HTMLBRElement} brEl
 * @returns {boolean}
 */
export function isFakeLineBreak(brEl) {
    return !(getState(...rightPos(brEl), DIRECTIONS.RIGHT).cType & (CTYPES.CONTENT | CTGROUPS.BR));
}

// Cursor management
//------------------------------------------------------------------------------


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
    const editable = closestElement(node, '.odoo-editor-editable');
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
            const leftInlineNode = leftLeafOnlyInScopeNotBlockEditablePath(el, elOffset).next().value;
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
                const rightInlineNode = rightLeafOnlyInScopeNotBlockEditablePath(el, elOffset).next().value;
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
    if (prevNode && prevNode.nodeName === 'BR' && isFakeLineBreak(prevNode)) {
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
    normalize = true,
) {
    if (
        !anchorNode ||
        !anchorNode.parentElement ||
        !anchorNode.parentElement.closest('body') ||
        !focusNode ||
        !focusNode.parentElement ||
        !focusNode.parentElement.closest('body')
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
        if (e.name !== 'NS_ERROR_FAILURE') {
            throw e;
        }
    }

    return [anchorNode, anchorOffset, focusNode, focusOffset];
}

/**
 * Returns an array containing all the nodes fully contained in the selection.
 *
 * @param {Node} editable
 * @returns {Node[]}
 */
export function getSelectedNodes(editable) {
    const selectedTableCells = editable.querySelectorAll('.o_selected_td');
    const document = editable.ownerDocument;
    const sel = document.getSelection();
    if (!sel.rangeCount && !selectedTableCells.length) {
        return [];
    }
    const range = sel.getRangeAt(0);
    return [...new Set(getTraversedNodes(editable).flatMap(
        node => {
            const td = closestElement(node, '.o_selected_td');
            if (td) {
                return descendants(td);
            } else if (range.isPointInRange(node, 0) && range.isPointInRange(node, nodeSize(node))) {
                return node;
            } else {
                return [];
            }
        },
    ))];
}

export function getDeepestPosition(node, offset) {
    let direction = DIRECTIONS.RIGHT;
    let next = node;
    while (next) {
        if (isVisible(next) || isZWS(next)) {
            // Valid node: update position then try to go deeper.
            if (next !== node) {
                [node, offset] = [next, direction ? 0 : nodeSize(next)];
            }
            // First switch direction to left if offset is at the end.
            direction = offset < node.childNodes.length;
            next = node.childNodes[direction ? offset : offset - 1];
        } else if (direction && next.nextSibling && !isBlock(next.nextSibling)) {
            // Invalid node: skip to next sibling (without crossing blocks).
            next = next.nextSibling;
        } else {
            // Invalid node: skip to previous sibling (without crossing blocks).
            direction = DIRECTIONS.LEFT;
            next = !isBlock(next.previousSibling) && next.previousSibling;
        }
        // Avoid too-deep ranges inside self-closing elements like [BR, 0].
        next = !isSelfClosingElement(next) && next;
    }
    return [node, offset];
}

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
        if (anchorOffset === focusOffset) return false;
        return anchorOffset < focusOffset ? DIRECTIONS.RIGHT : DIRECTIONS.LEFT;
    }
    return anchorNode.compareDocumentPosition(focusNode) & Node.DOCUMENT_POSITION_FOLLOWING
        ? DIRECTIONS.RIGHT
        : DIRECTIONS.LEFT;
}
/**
 * Returns an array containing all the nodes traversed when walking the
 * selection.
 *
 * @param {Node} editable
 * @returns {Node[]}
 */
export function getTraversedNodes(editable, range = getDeepRange(editable)) {
    const selectedTableCells = editable.querySelectorAll('.o_selected_td');
    const document = editable.ownerDocument;
    if (!range) return [];
    const iterator = document.createNodeIterator(range.commonAncestorContainer);
    let node;
    do {
        node = iterator.nextNode();
    } while (node && node !== range.startContainer && !(selectedTableCells.length && node === selectedTableCells[0]));
    const traversedNodes = new Set([node, ...descendants(node)]);
    while (node && node !== range.endContainer) {
        node = iterator.nextNode();
        if (node) {
            const selectedTable = closestElement(node, '.o_selected_table');
            if (selectedTable) {
                for (const selectedTd of selectedTable.querySelectorAll('.o_selected_td')) {
                    traversedNodes.add(selectedTd);
                    descendants(selectedTd).forEach(descendant => traversedNodes.add(descendant));
                }
            } else {
                traversedNodes.add(node);
            }
        }
    }
    return [...traversedNodes];
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
    sel = sel || editable.parentElement && editable.ownerDocument.getSelection();
    if (sel && sel.isCollapsed && sel.anchorNode && sel.anchorNode.nodeName === "BR") {
        setCursorStart(sel.anchorNode.parentElement, false);
    }
    range = range ? range.cloneRange() : sel && sel.rangeCount && sel.getRangeAt(0).cloneRange();
    if (!range) return;
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
        (!beforeEnd || (beforeEnd.nodeType === Node.TEXT_NODE && !isVisibleTextNode(beforeEnd) && !isZWS(beforeEnd)))
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

// DOM Modification
//------------------------------------------------------------------------------

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
export function insertText(sel, content) {
    if (sel.anchorNode.nodeType === Node.TEXT_NODE) {
        const pos = [sel.anchorNode.parentElement, splitTextNode(sel.anchorNode, sel.anchorOffset)];
        setSelection(...pos, ...pos, false);
    }
    const txt = document.createTextNode(content || '#');
    const restore = prepareUpdate(sel.anchorNode, sel.anchorOffset);
    sel.getRangeAt(0).insertNode(txt);
    restore();
    setSelection(...boundariesOut(txt), false);
    return txt;
}

export function unwrapContents(node) {
    const contents = [...node.childNodes];
    for (const child of contents) {
        node.parentNode.insertBefore(child, node);
    }
    node.parentNode.removeChild(node);
    return contents;
}

/**
 * Takes a selection (assumed to be collapsed) and insert a zero-width space at
 * its anchor point. Then, select that zero-width space.
 *
 * @param {Selection} selection
 * @returns {Node} the inserted zero-width space
 */
export function insertAndSelectZws(selection) {
    const offset = selection.anchorOffset;
    const zws = insertText(selection, '\u200B');
    splitTextNode(zws, offset);
    selection.getRangeAt(0).selectNode(zws);
    return zws;
}

// Prepare / Save / Restore state utilities
//------------------------------------------------------------------------------

const prepareUpdateLockedEditables = new Set();
/**
 * Any editor command is applied to a selection (collapsed or not). After the
 * command, the content type on the selection boundaries, in both direction,
 * should be preserved (some whitespace should disappear as went from collapsed
 * to non collapsed, or converted to &nbsp; as went from non collapsed to
 * collapsed, there also <br> to remove/duplicate, etc).
 *
 * This function returns a callback which allows to do that after the command
 * has been done.
 *
 * Note: the method has been made generic enough to work with non-collapsed
 * selection but can be used for an unique cursor position.
 *
 * @param {HTMLElement} el
 * @param {number} offset
 * @param {...(HTMLElement|number)} args - argument 1 and 2 can be repeated for
 *     multiple preparations with only one restore callback returned. Note: in
 *     that case, the positions should be given in the document node order.
 * @param {Object} [options]
 * @param {boolean} [options.allowReenter = true] - if false, all calls to
 *     prepareUpdate before this one gets restored will be ignored.
 * @param {string} [options.label = <random 6 character string>]
 * @param {boolean} [options.debug = false] - if true, adds nicely formatted
 *     console logs to help with debugging.
 * @returns {function}
 */
export function prepareUpdate(...args) {
    const closestRoot = args.length && ancestors(args[0]).find(ancestor => ancestor.oid === 'root');
    const isPrepareUpdateLocked = closestRoot && prepareUpdateLockedEditables.has(closestRoot);
    const hash = (Math.random() + 1).toString(36).substring(7);
    const options = {
        allowReenter: true,
        label: hash,
        debug: false,
        ...(args.length && args[args.length - 1] instanceof Object ? args.pop() : {}),
    };
    if (options.debug) {
        console.log(
            '%cPreparing%c update: ' + options.label +
            (options.label === hash ? '' : ` (${hash})`) +
            '%c' + (isPrepareUpdateLocked ? ' LOCKED' : ''),
            'color: cyan;',
            'color: white;',
            'color: red; font-weight: bold;',
        );
    }
    if (isPrepareUpdateLocked) {
        return () => {
            if (options.debug) {
                console.log(
                    '%cRestoring%c update: ' + options.label +
                    (options.label === hash ? '' : ` (${hash})`) +
                    '%c LOCKED',
                    'color: lightgreen;',
                    'color: white;',
                    'color: red; font-weight: bold;',
                );
            }
        };
    }
    if (!options.allowReenter && closestRoot) {
        prepareUpdateLockedEditables.add(closestRoot);
    }
    const positions = [...args];

    // Check the state in each direction starting from each position.
    const restoreData = [];
    let el, offset;
    while (positions.length) {
        // Note: important to get the positions in reverse order to restore
        // right side before left side.
        offset = positions.pop();
        el = positions.pop();
        const left = getState(el, offset, DIRECTIONS.LEFT);
        const right = getState(el, offset, DIRECTIONS.RIGHT, left.cType);
        if (options.debug) {
            const editable = el && closestElement(el, '.odoo-editor-editable');
            const oldEditableHTML = editable && editable.innerHTML.replaceAll(' ', '_').replaceAll('\u200B', 'ZWS') || '';
            left.oldEditableHTML = oldEditableHTML;
            right.oldEditableHTML = oldEditableHTML;
        }
        restoreData.push(left, right);
    }

    // Create the callback that will be able to restore the state in each
    // direction wherever the node in the opposite direction has landed.
    return function restoreStates() {
        if (options.debug) {
            console.log(
                '%cRestoring%c update: ' + options.label +
                (options.label === hash ? '' : ` (${hash})`),
                'color: lightgreen;',
                'color: white;',
            );
        }
        for (const data of restoreData) {
            restoreState(data, options.debug);
        }
        if (!options.allowReenter && closestRoot) {
            prepareUpdateLockedEditables.delete(closestRoot);
        }
    };
}
/**
 * Retrieves the "state" from a given position looking at the given direction.
 * The "state" is the type of content. The functions also returns the first
 * meaninful node looking in the opposite direction = the first node we trust
 * will not disappear if a command is played in the given direction.
 *
 * Note: only work for in-between nodes positions. If the position is inside a
 * text node, first split it @see splitTextNode.
 *
 * @param {HTMLElement} el
 * @param {number} offset
 * @param {DIRECTIONS} direction @see DIRECTIONS.LEFT @see DIRECTIONS.RIGHT
 * @param {CTYPES} [leftCType]
 * @returns {Object}
 */
export function getState(el, offset, direction, leftCType) {
    const leftDOMPath = leftLeafOnlyNotBlockPath;
    const rightDOMPath = rightLeafOnlyNotBlockPath;

    let domPath;
    let inverseDOMPath;
    const whitespaceAtStartRegex = new RegExp('^' + whitespace + '+');
    const whitespaceAtEndRegex = new RegExp(whitespace + '+$');
    const reasons = [];
    if (direction === DIRECTIONS.LEFT) {
        domPath = leftDOMPath(el, offset, reasons);
        inverseDOMPath = rightDOMPath(el, offset);
    } else {
        domPath = rightDOMPath(el, offset, reasons);
        inverseDOMPath = leftDOMPath(el, offset);
    }

    // TODO I think sometimes, the node we have to consider as the
    // anchor point to restore the state is not the first one of the inverse
    // path (like for example, empty text nodes that may disappear
    // after the command so we would not want to get those ones).
    const boundaryNode = inverseDOMPath.next().value;

    // We only traverse through deep inline nodes. If we cannot find a
    // meanfingful state between them, that means we hit a block.
    let cType = undefined;

    // Traverse the DOM in the given direction to check what type of content
    // there is.
    let lastSpace = null;
    for (const node of domPath) {
        if (node.nodeType === Node.TEXT_NODE) {
            const value = node.nodeValue;
            // If we hit a text node, the state depends on the path direction:
            // any space encountered backwards is a visible space if we hit
            // visible content afterwards. If going forward, spaces are only
            // visible if we have content backwards.
            if (direction === DIRECTIONS.LEFT) {
                if (!isWhitespace(value)) {
                    if (lastSpace) {
                        cType = CTYPES.SPACE;
                    } else {
                        const rightLeaf = rightLeafOnlyNotBlockPath(node).next().value;
                        const hasContentRight = rightLeaf && !whitespaceAtStartRegex.test(rightLeaf.textContent);
                        cType = !hasContentRight && whitespaceAtEndRegex.test(node.textContent) ? CTYPES.SPACE : CTYPES.CONTENT;
                    }
                    break;
                }
                if (value.length) {
                    lastSpace = node;
                }
            } else {
                leftCType = leftCType || getState(el, offset, DIRECTIONS.LEFT).cType;
                if (whitespaceAtStartRegex.test(value)) {
                    const leftLeaf = leftLeafOnlyNotBlockPath(node).next().value;
                    const hasContentLeft = leftLeaf && !whitespaceAtEndRegex.test(leftLeaf.textContent);
                    const rct = !isWhitespace(value)
                        ? CTYPES.CONTENT
                        : getState(...rightPos(node), DIRECTIONS.RIGHT).cType;
                    cType =
                        leftCType & CTYPES.CONTENT && rct & (CTYPES.CONTENT | CTYPES.BR) && !hasContentLeft
                            ? CTYPES.SPACE
                            : rct;
                    break;
                }
                if (!isWhitespace(value)) {
                    cType = CTYPES.CONTENT;
                    break;
                }
            }
        } else if (node.nodeName === 'BR') {
            cType = CTYPES.BR;
            break;
        } else if (isVisible(node)) {
            // E.g. an image
            cType = CTYPES.CONTENT;
            break;
        }
    }

    if (cType === undefined) {
        cType = reasons.includes(PATH_END_REASONS.BLOCK_HIT)
            ? CTYPES.BLOCK_OUTSIDE
            : CTYPES.BLOCK_INSIDE;
    }

    return {
        node: boundaryNode,
        direction: direction,
        cType: cType, // Short for contentType
    };
}
const priorityRestoreStateRules = [
    // Each entry is a list of two objects, with each key being optional (the
    // more key-value pairs, the bigger the priority).
    // {direction: ..., cType1: ..., cType2: ...}
    // ->
    // {spaceVisibility: (false|true), brVisibility: (false|true)}
    [
        // Replace a space by &nbsp; when it was not collapsed before and now is
        // collapsed (one-letter word removal for example).
        { cType1: CTYPES.CONTENT, cType2: CTYPES.SPACE | CTGROUPS.BLOCK },
        { spaceVisibility: true },
    ],
    [
        // Replace a space by &nbsp; when it was content before and now it is
        // a BR.
        { direction: DIRECTIONS.LEFT, cType1: CTGROUPS.INLINE, cType2: CTGROUPS.BR },
        { spaceVisibility: true },
    ],
    [
        // Replace a space by &nbsp; when it was content before and now it is
        // a BR (removal of last character before a BR for example).
        { direction: DIRECTIONS.RIGHT, cType1: CTGROUPS.CONTENT, cType2: CTGROUPS.BR },
        { spaceVisibility: true },
    ],
    [
        // Replace a space by &nbsp; when it was visible thanks to a BR which
        // is now gone.
        { direction: DIRECTIONS.RIGHT, cType1: CTGROUPS.BR, cType2: CTYPES.SPACE | CTGROUPS.BLOCK },
        { spaceVisibility: true },
    ],
    [
        // Remove all collapsed spaces when a space is removed.
        { cType1: CTYPES.SPACE },
        { spaceVisibility: false },
    ],
    [
        // Remove spaces once the preceeding BR is removed
        { direction: DIRECTIONS.LEFT, cType1: CTGROUPS.BR },
        { spaceVisibility: false },
    ],
    [
        // Remove space before block once content is put after it (otherwise it
        // would become visible).
        { cType1: CTGROUPS.BLOCK, cType2: CTGROUPS.INLINE | CTGROUPS.BR },
        { spaceVisibility: false },
    ],
    [
        // Duplicate a BR once the content afterwards disappears
        { direction: DIRECTIONS.RIGHT, cType1: CTGROUPS.INLINE, cType2: CTGROUPS.BLOCK },
        { brVisibility: true },
    ],
    [
        // Remove a BR at the end of a block once inline content is put after
        // it (otherwise it would act as a line break).
        {
            direction: DIRECTIONS.RIGHT,
            cType1: CTGROUPS.BLOCK,
            cType2: CTGROUPS.INLINE | CTGROUPS.BR,
        },
        { brVisibility: false },
    ],
    [
        // Remove a BR once the BR that preceeds it is now replaced by
        // content (or if it was a BR at the start of a block which now is
        // a trailing BR).
        {
            direction: DIRECTIONS.LEFT,
            cType1: CTGROUPS.BR | CTGROUPS.BLOCK,
            cType2: CTGROUPS.INLINE,
        },
        { brVisibility: false, extraBRRemovalCondition: brNode => isFakeLineBreak(brNode) },
    ],
];
function restoreStateRuleHashCode(direction, cType1, cType2) {
    return `${direction}-${cType1}-${cType2}`;
}
const allRestoreStateRules = (function () {
    const map = new Map();

    const keys = ['direction', 'cType1', 'cType2'];
    for (const direction of Object.values(DIRECTIONS)) {
        for (const cType1 of Object.values(CTYPES)) {
            for (const cType2 of Object.values(CTYPES)) {
                const rule = { direction: direction, cType1: cType1, cType2: cType2 };

                // Search for the rules which match whatever their priority
                const matchedRules = [];
                for (const entry of priorityRestoreStateRules) {
                    let priority = 0;
                    for (const key of keys) {
                        const entryKeyValue = entry[0][key];
                        if (entryKeyValue !== undefined) {
                            if (
                                typeof entryKeyValue === 'boolean'
                                    ? rule[key] === entryKeyValue
                                    : rule[key] & entryKeyValue
                            ) {
                                priority++;
                            } else {
                                priority = -1;
                                break;
                            }
                        }
                    }
                    if (priority >= 0) {
                        matchedRules.push([priority, entry[1]]);
                    }
                }

                // Create the final rule by merging found rules by order of
                // priority
                const finalRule = {};
                for (let p = 0; p <= keys.length; p++) {
                    for (const entry of matchedRules) {
                        if (entry[0] === p) {
                            Object.assign(finalRule, entry[1]);
                        }
                    }
                }

                // Create an unique identifier for the set of values
                // direction - state 1 - state2 to add the rule in the map
                const hashCode = restoreStateRuleHashCode(direction, cType1, cType2);
                map.set(hashCode, finalRule);
            }
        }
    }

    return map;
})();
/**
 * Restores the given state starting before the given while looking in the given
 * direction.
 *
 * @param {Object} prevStateData @see getState
 * @param {boolean} debug=false - if true, adds nicely formatted
 *     console logs to help with debugging.
 * @returns {Object|undefined} the rule that was applied to restore the state,
 *     if any, for testing purposes.
 */
export function restoreState(prevStateData, debug=false) {
    const { node, direction, cType: cType1, oldEditableHTML } = prevStateData;
    if (!node || !node.parentNode) {
        // FIXME sometimes we want to restore the state starting from a node
        // which has been removed by another restoreState call... Not sure if
        // it is a problem or not, to investigate.
        return;
    }
    const [el, offset] = direction === DIRECTIONS.LEFT ? leftPos(node) : rightPos(node);
    const { cType: cType2 } = getState(el, offset, direction);

    /**
     * Knowing the old state data and the new state data, we know if we have to
     * do something or not, and what to do.
     */
    const ruleHashCode = restoreStateRuleHashCode(direction, cType1, cType2);
    const rule = allRestoreStateRules.get(ruleHashCode);
    if (debug) {
        const editable = closestElement(node, '.odoo-editor-editable');
        console.log(
            '%c' + node.textContent.replaceAll(' ', '_').replaceAll('\u200B', 'ZWS') + '\n' +
            '%c' + (direction === DIRECTIONS.LEFT ? 'left' : 'right') + '\n' +
            '%c' + ctypeToString(cType1) + '\n' +
            '%c' + ctypeToString(cType2) + '\n' +
            '%c' + 'BEFORE: ' + (oldEditableHTML || '(unavailable)') + '\n' +
            '%c' + 'AFTER:  ' + (editable ? editable.innerHTML.replaceAll(' ', '_').replaceAll('\u200B', 'ZWS') : '(unavailable)') + '\n',
            'color: white; display: block; width: 100%;',
            'color: ' + (direction === DIRECTIONS.LEFT ? 'magenta' : 'lightgreen') + '; display: block; width: 100%;',
            'color: pink; display: block; width: 100%;',
            'color: lightblue; display: block; width: 100%;',
            'color: white; display: block; width: 100%;',
            'color: white; display: block; width: 100%;',
            rule,
        );
    }
    if (Object.values(rule).filter(x => x !== undefined).length) {
        const inverseDirection = direction === DIRECTIONS.LEFT ? DIRECTIONS.RIGHT : DIRECTIONS.LEFT;
        enforceWhitespace(el, offset, inverseDirection, rule);
    }
    return rule;
}
/**
 * Enforces the whitespace and BR visibility in the given direction starting
 * from the given position.
 *
 * @param {HTMLElement} el
 * @param {number} offset
 * @param {number} direction @see DIRECTIONS.LEFT @see DIRECTIONS.RIGHT
 * @param {Object} rule
 * @param {boolean} [rule.spaceVisibility]
 * @param {boolean} [rule.brVisibility]
 */
export function enforceWhitespace(el, offset, direction, rule) {
    let domPath, whitespaceAtEdgeRegex;
    if (direction === DIRECTIONS.LEFT) {
        domPath = leftLeafOnlyNotBlockPath(el, offset);
        whitespaceAtEdgeRegex = new RegExp(whitespace + '+$');
    } else {
        domPath = rightLeafOnlyNotBlockPath(el, offset);
        whitespaceAtEdgeRegex = new RegExp('^' + whitespace + '+');
    }

    const invisibleSpaceTextNodes = [];
    let foundVisibleSpaceTextNode = null;
    for (const node of domPath) {
        if (node.nodeName === 'BR') {
            if (rule.brVisibility === undefined) {
                break;
            }
            if (rule.brVisibility) {
                node.before(document.createElement('br'));
            } else {
                if (!rule.extraBRRemovalCondition || rule.extraBRRemovalCondition(node)) {
                    node.remove();
                }
            }
            break;
        } else if (node.nodeType === Node.TEXT_NODE && !isInPre(node)) {
            if (whitespaceAtEdgeRegex.test(node.nodeValue)) {
                // If we hit spaces going in the direction, either they are in a
                // visible text node and we have to change the visibility of
                // those spaces, or it is in an invisible text node. In that
                // last case, we either remove the spaces if there are spaces in
                // a visible text node going further in the direction or we
                // change the visiblity or those spaces.
                if (!isWhitespace(node)) {
                    foundVisibleSpaceTextNode = node;
                    break;
                } else {
                    invisibleSpaceTextNodes.push(node);
                }
            } else if (!isWhitespace(node)) {
                break;
            }
        } else {
            break;
        }
    }

    if (rule.spaceVisibility === undefined) {
        return;
    }
    if (!rule.spaceVisibility) {
        for (const node of invisibleSpaceTextNodes) {
            // Empty and not remove to not mess with offset-based positions in
            // commands implementation, also remove non-block empty parents.
            node.nodeValue = '';
            const ancestorPath = closestPath(node.parentNode);
            let toRemove = null;
            for (const pNode of ancestorPath) {
                if (toRemove) {
                    toRemove.remove();
                }
                if (pNode.childNodes.length === 1 && !isBlock(pNode)) {
                    pNode.after(node);
                    toRemove = pNode;
                } else {
                    break;
                }
            }
        }
    }
    const spaceNode = foundVisibleSpaceTextNode || invisibleSpaceTextNodes[0];
    if (spaceNode) {
        let spaceVisibility = rule.spaceVisibility;
        // In case we are asked to replace the space by a &nbsp;, disobey and
        // do the opposite if that space is currently not visible
        // TODO I'd like this to not be needed, it feels wrong...
        if (
            spaceVisibility &&
            !foundVisibleSpaceTextNode &&
            getState(...rightPos(spaceNode), DIRECTIONS.RIGHT).cType & CTGROUPS.BLOCK
        ) {
            spaceVisibility = false;
        }
        spaceNode.nodeValue = spaceNode.nodeValue.replace(whitespaceAtEdgeRegex, spaceVisibility ? '\u00A0' : '');
    }
}

// Format
//------------------------------------------------------------------------------

const formatsSpecs = {
    italic: {
        tagName: 'em',
        isFormatted: isItalic,
        isTag: (node) => ['EM', 'I'].includes(node.tagName),
        hasStyle: (node) => Boolean(node.style && node.style['font-style']),
        addStyle: (node) => node.style['font-style'] = 'italic',
        addNeutralStyle: (node) => node.style['font-style'] = 'normal',
        removeStyle: (node) => removeStyle(node, 'font-style'),
    },
    bold: {
        tagName: 'strong',
        isFormatted: isBold,
        isTag: (node) => ['STRONG', 'B'].includes(node.tagName),
        hasStyle: (node) => Boolean(node.style && node.style['font-weight']),
        addStyle: (node) => node.style['font-weight'] = 'bolder',
        addNeutralStyle: (node) => {
            node.style['font-weight'] = 'normal'
        },
        removeStyle: (node) => removeStyle(node, 'font-weight'),
    },
    underline: {
        tagName: 'u',
        isFormatted: isUnderline,
        isTag: (node) => node.tagName === 'U',
        hasStyle: (node) => node.style && node.style['text-decoration-line'].includes('underline'),
        addStyle: (node) => node.style['text-decoration-line'] += ' underline',
        removeStyle: (node) => removeStyle(node, 'text-decoration-line', 'underline'),
    },
    strikeThrough: {
        tagName: 's',
        isFormatted: isStrikeThrough,
        isTag: (node) => node.tagName === 'S',
        hasStyle: (node) => node.style && node.style['text-decoration-line'].includes('line-through'),
        addStyle: (node) => node.style['text-decoration-line'] += ' line-through',
        removeStyle: (node) => removeStyle(node, 'text-decoration-line', 'line-through'),
    },
    fontSize: {
        isFormatted: isFontSize,
        hasStyle: (node) => node.style && node.style['font-size'],
        addStyle: (node, props) => {
            node.style['font-size'] = props.size;
            node.classList.remove(...FONT_SIZE_CLASSES);
        },
        removeStyle: (node) => removeStyle(node, 'font-size'),
    },
    setFontSizeClassName: {
        isFormatted: hasClass,
        hasStyle: (node, props) => FONT_SIZE_CLASSES
            .find(cls => node.classList.contains(cls)),
        addStyle: (node, props) => node.classList.add(props.className),
        removeStyle: (node) => {
            node.classList.remove(...FONT_SIZE_CLASSES, ...TEXT_STYLE_CLASSES);
            if (node.classList.length === 0) {
                node.removeAttribute("class");
            }
        },
    },
    switchDirection: {
        isFormatted: isDirectionSwitched,
    }
}
function removeStyle (node, styleName, item) {
    if (item) {
        const newStyle = node.style[styleName].split(' ').filter(x => x !== item).join(' ');
        node.style[styleName] = newStyle || null;
    } else {
        node.style[styleName] = null;
    }
    if (node.getAttribute('style') === '') {
        node.removeAttribute('style');
    }
};
function getOrCreateSpan (node, ancestors) {
    const span = ancestors.find((element) => element.tagName === 'SPAN' && element.isConnected);
    if (span) {
        return span;
    } else {
        const span = document.createElement('span');
        node.after(span);
        span.append(node);
        return span;
    }
}
function removeFormat (node, formatSpec) {
    node = closestElement(node);
    if (formatSpec.hasStyle(node)) {
        formatSpec.removeStyle(node);
        if (['SPAN', 'FONT'].includes(node.tagName) && !node.getAttributeNames().length) {
            return unwrapContents(node);
        }
    }

    if (formatSpec.isTag && formatSpec.isTag(node)) {
        const attributesNames = node.getAttributeNames().filter((name)=> {
            return name !== 'data-oe-zws-empty-inline';
        });
        if (attributesNames.length) {
            // Change tag name
            const newNode = document.createElement('span');
            while (node.firstChild) {
                newNode.appendChild(node.firstChild);
            }
            for (let index = node.attributes.length - 1; index >= 0; --index) {
                newNode.attributes.setNamedItem(node.attributes[index].cloneNode());
            }
            node.parentNode.replaceChild(newNode, node);
        } else {
            unwrapContents(node);
        }
    }
}
export function formatSelection (editable, formatName, {applyStyle, formatProps} = {}) {
    const selection = editable.ownerDocument.getSelection();
    let direction
    let wasCollapsed;
    if (editable.querySelector('.o_selected_td')) {
        direction = DIRECTIONS.RIGHT;
    } else {
        if (!selection.rangeCount) return;
        wasCollapsed = selection.getRangeAt(0).collapsed;

        direction = getCursorDirection(selection.anchorNode, selection.anchorOffset, selection.focusNode, selection.focusOffset);
    }
    getDeepRange(editable, { splitText: true, select: true, correctTripleClick: true });

    if (typeof applyStyle === 'undefined') {
        applyStyle = !isSelectionFormat(editable, formatName);
    }

    let zws;
    if (wasCollapsed) {
        if (selection.anchorNode.nodeType === Node.TEXT_NODE && selection.anchorNode.textContent === '\u200b') {
            zws = selection.anchorNode;
            selection.getRangeAt(0).selectNode(zws);
        } else {
            zws = insertAndSelectZws(selection);
        }
        getDeepRange(editable, { splitText: true, select: true, correctTripleClick: true });
    }

    // Get selected nodes within td to handle non-p elements like h1, h2...
    // Targeting <br> to ensure span stays inside its corresponding block node.
    const selectedNodesInTds = [...editable.querySelectorAll('.o_selected_td')]
        .map(node => closestElement(node).querySelector('br'));
    const selectedNodes = getSelectedNodes(editable)
        .filter(n => n.nodeType === Node.TEXT_NODE && closestElement(n).isContentEditable && (isVisibleTextNode(n) || isZWS(n)));
    const selectedTextNodes = selectedNodes.length ? selectedNodes : selectedNodesInTds;

    const selectedFieldNodes = new Set(getSelectedNodes(editable)
            .map(n =>closestElement(n, "*[t-field],*[t-out],*[t-esc]"))
            .filter(Boolean));

    const formatSpec = formatsSpecs[formatName];
    for (const selectedTextNode of selectedTextNodes) {
        const inlineAncestors = [];
        let currentNode = selectedTextNode;
        let parentNode = selectedTextNode.parentElement;

        // Remove the format on all inline ancestors until a block or an element
        // with a class that is not related to font size (in case the formatting
        // comes from the class).
        while (parentNode && (!isBlock(parentNode) && (parentNode.classList.length === 0 ||
                [...parentNode.classList].every(cls => FONT_SIZE_CLASSES.includes(cls))))) {
            const isUselessZws = parentNode.tagName === 'SPAN' &&
                parentNode.hasAttribute('data-oe-zws-empty-inline') &&
                parentNode.getAttributeNames().length === 1;

            if (isUselessZws) {
                unwrapContents(parentNode);
            } else {
                const newLastAncestorInlineFormat = splitAroundUntil(currentNode, parentNode);
                removeFormat(newLastAncestorInlineFormat, formatSpec);
                if (newLastAncestorInlineFormat.isConnected) {
                    inlineAncestors.push(newLastAncestorInlineFormat);
                    currentNode = newLastAncestorInlineFormat;
                }
            }

            parentNode = currentNode.parentElement;
        }

        const firstBlockOrClassHasFormat = formatSpec.isFormatted(parentNode, formatProps);
        if (firstBlockOrClassHasFormat && !applyStyle) {
            formatSpec.addNeutralStyle && formatSpec.addNeutralStyle(getOrCreateSpan(selectedTextNode, inlineAncestors));
        } else if (!firstBlockOrClassHasFormat && applyStyle) {
            const tag = formatSpec.tagName && document.createElement(formatSpec.tagName);
            if (tag) {
                selectedTextNode.after(tag);
                tag.append(selectedTextNode);

                if (!formatSpec.isFormatted(tag, formatProps)) {
                    tag.after(selectedTextNode);
                    tag.remove();
                    formatSpec.addStyle(getOrCreateSpan(selectedTextNode, inlineAncestors), formatProps);
                }
            } else if (formatName !== 'fontSize' || formatProps.size !== undefined) {
                formatSpec.addStyle(getOrCreateSpan(selectedTextNode, inlineAncestors), formatProps);
            }
        }
    }

    for (const selectedFieldNode of selectedFieldNodes) {
        if (applyStyle) {
            formatSpec.addStyle(selectedFieldNode, formatProps);
        } else {
            formatSpec.removeStyle(selectedFieldNode);
        }
    }

    if (zws) {
        const siblings = [...zws.parentElement.childNodes];
        if (
            !isBlock(zws.parentElement) &&
            selectedTextNodes.includes(siblings[0]) &&
            selectedTextNodes.includes(siblings[siblings.length - 1])
        ) {
            zws.parentElement.setAttribute('data-oe-zws-empty-inline', '');
        } else {
            const span = document.createElement('span');
            span.setAttribute('data-oe-zws-empty-inline', '');
            zws.before(span);
            span.append(zws);
        }
    }

    if (selectedTextNodes[0] && selectedTextNodes[0].textContent === '\u200B') {
        setSelection(selectedTextNodes[0], 0);
    } else if (selectedTextNodes.length) {
        const firstNode = selectedTextNodes[0];
        const lastNode = selectedTextNodes[selectedTextNodes.length - 1];
        if (direction === DIRECTIONS.RIGHT) {
            setSelection(firstNode, 0, lastNode, lastNode.length, false);
        } else {
            setSelection(lastNode, lastNode.length, firstNode, 0, false);
        }
    }
}
