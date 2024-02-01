import { getDeepRange } from "./selection";

/**
 * Set a deep selection that split the text and collapse it if only one ZWS is
 * selected.
 *
 * @param {HTMLElement} editable
 * @param {Selection} selection
 * @returns {boolean} true if the selection has only one ZWS.
 */
export function collapseIfZWS(editable, selection) {
    const range = getDeepRange(editable, {
        selection,
        splitText: true,
        select: true,
        correctTripleClick: true,
    });

    if (
        range &&
        range.startContainer === range.endContainer &&
        range.endContainer.nodeType === Node.TEXT_NODE &&
        range.cloneContents().textContent === "\u200B"
    ) {
        // We Collapse the selection and bypass deleteRange
        // if the range content is only one ZWS.
        selection.collapseToStart();
        return true;
    }
    return false;
}
