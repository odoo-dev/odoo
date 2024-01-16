/** @odoo-module */

import { isBlock } from "../utils/blocks";
import { splitAroundUntil, splitTextNode } from "../utils/dom";
import {
    hasClass,
    isBold,
    isDirectionSwitched,
    isFontSize,
    isItalic,
    isNotEditableNode,
    isSelfClosingElement,
    isStrikeThrough,
    isUnderline,
    isVisible,
    isVisibleTextNode,
    isZWS,
} from "../utils/dom_info";
import { prepareUpdate } from "../utils/dom_state";
import {
    closestElement,
    createDOMPathGenerator,
    descendants,
    firstLeaf,
    lastLeaf,
} from "../utils/dom_traversal";
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
import { getCursorDirection } from "../utils/selection";


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
