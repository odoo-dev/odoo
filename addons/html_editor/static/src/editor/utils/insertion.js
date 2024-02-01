import { splitTextNode } from "./dom_split";
import { prepareUpdate } from "./dom_state";
import { boundariesOut } from "./position";
import { setSelection } from "./selection";

export function insertText(sel, content) {
    if (sel.anchorNode.nodeType === Node.TEXT_NODE) {
        const pos = [sel.anchorNode.parentElement, splitTextNode(sel.anchorNode, sel.anchorOffset)];
        setSelection(...pos, ...pos, false);
    }
    const txt = document.createTextNode(content || "#");
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
    const zws = insertText(selection, "\u200B");
    splitTextNode(zws, offset);
    selection.getRangeAt(0).selectNode(zws);
    return zws;
}
