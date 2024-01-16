/** @odoo-module */

import { isBlock } from "../utils/blocks";
import { splitAroundUntil, splitTextNode, unwrapContents } from "../utils/dom";
import {
    isNotEditableNode,
    isVisibleTextNode,
    isZWS
} from "../utils/dom_info";
import { prepareUpdate } from "../utils/dom_state";
import {
    closestElement,
    createDOMPathGenerator,
    descendants
} from "../utils/dom_traversal";
import { FONT_SIZE_CLASSES, formatsSpecs } from "../utils/formatting";
import {
    DIRECTIONS,
    boundariesOut,
    nodeSize
} from "../utils/position";
import { getCursorDirection, getDeepRange, setSelection } from "../utils/selection";



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

export const rightLeafOnlyNotBlockPath = createDOMPathGenerator(DIRECTIONS.RIGHT, {
    leafOnly: true,
    stopTraverseFunction: isBlock,
    stopFunction: isBlock,
});

export const rightLeafOnlyPathNotBlockNotEditablePath = createDOMPathGenerator(DIRECTIONS.RIGHT, {
    leafOnly: true,
});
export const rightLeafOnlyNotBlockNotEditablePath = createDOMPathGenerator(DIRECTIONS.RIGHT, {
    leafOnly: true,
    stopTraverseFunction: node => isNotEditableNode(node) || isBlock(node),
    stopFunction: node => isBlock(node) && !isNotEditableNode(node),
});

// DOM Path and node search functions
//------------------------------------------------------------------------------


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
