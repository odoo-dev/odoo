import { Plugin } from "../plugin";
import { DIRECTIONS, endPos, nodeSize } from "../utils/position";
import {
    normalizeDeepCursorPosition,
    normalizeCursorPosition,
    normalizeFakeBR,
} from "../utils/selection";

/**
 * @typedef { Object } EditorSelection
 * @property { Node } anchorNode
 * @property { number } anchorOffset
 * @property { Node } focusNode
 * @property { number } focusOffset
 * @property { Node } startContainer
 * @property { number } startOffset
 * @property { Node } endContainer
 * @property { number } endOffset
 * @property { Node } commonAncestorContainer
 * @property { boolean } isCollapsed
 * @property { boolean } direction
 * @property { boolean } inEditable
 */

export class SelectionPlugin extends Plugin {
    static name = "selection";
    static shared = [
        "getEditableSelection",
        "setSelection",
        "setCursorStart",
        "setCursorEnd",
        "extractContent",
    ];

    setup() {
        this.activeSelection = this.makeSelection(false, false);
        this.addDomListener(this.document, "selectionchange", this.updateActiveSelection);
        this.addDomListener(this.editable, "click", (ev) => {
            if (ev.detail >= 3) {
                const { anchorNode, anchorOffset } = this.getEditableSelection();
                const [focusNode, focusOffset] = endPos(anchorNode);
                this.setSelection({ anchorNode, anchorOffset, focusNode, focusOffset });
            }
        });
    }

    /**
     * Update the active selection to the current selection in the editor.
     */
    updateActiveSelection() {
        const selection = this.document.getSelection();
        if (!selection || selection.rangeCount === 0) {
            return;
        }
        const range = selection.getRangeAt(0);
        const inEditable = this.editable.contains(range.commonAncestorContainer);
        if (inEditable) {
            this.activeSelection = this.makeSelection(selection, inEditable);
        } else {
            const newSelection = { ...this.activeSelection, inEditable: false };
            Object.freeze(newSelection);
            this.activeSelection = newSelection;
        }

        for (const handler of this.resources.onSelectionChange || []) {
            handler(this.activeSelection);
        }
    }

    /**
     * @param { Selection } selection The DOM selection
     * @return { EditorSelection }
     */
    makeSelection(selection, inEditable) {
        let range;
        if (!selection || !selection.rangeCount) {
            selection = false;
            range = new Range();
            range.setStart(this.editable, 0);
            range.setEnd(this.editable, 0);
        } else {
            range = selection.getRangeAt(0);
        }
        const isCollapsed = selection && selection.isCollapsed;

        const anchorNode = selection ? selection.anchorNode : range.startContainer;
        const anchorOffset = selection ? selection.anchorOffset : range.startOffset;
        let startContainer, startOffset, endContainer, endOffset;
        const focusNode = selection ? selection.focusNode : range.endContainer;
        const focusOffset = selection ? selection.focusOffset : range.endOffset;

        this.lastAnchorOffset = anchorOffset;
        this.lastFocusOffset = focusOffset;

        let direction = anchorNode === range.startContainer ? DIRECTIONS.RIGHT : DIRECTIONS.LEFT;
        if (anchorNode === focusNode && focusOffset <= anchorOffset) {
            direction = !direction;
        }

        if (direction) {
            [startContainer, startOffset] = [anchorNode, anchorOffset];
            [endContainer, endOffset] = [focusNode, focusOffset];
        } else {
            [startContainer, startOffset] = [focusNode, focusOffset];
            [endContainer, endOffset] = [anchorNode, anchorOffset];
        }

        const activeSelection = {
            anchorNode,
            anchorOffset,
            focusNode,
            focusOffset,
            startContainer,
            startOffset,
            endContainer,
            endOffset,
            commonAncestorContainer: range.commonAncestorContainer,
            isCollapsed,
            direction,
            inEditable,
        };

        Object.freeze(activeSelection);
        return activeSelection;
    }

    /**
     * @param { EditorSelection } selection
     */
    extractContent(selection) {
        const range = new Range();
        range.setStart(selection.startContainer, selection.startOffset);
        range.setEnd(selection.endContainer, selection.endOffset);
        return range.extractContents();
    }

    /**
     * @return { EditorSelection }
     */
    getEditableSelection() {
        const selection = this.document.getSelection();
        if (
            selection &&
            selection.rangeCount &&
            this.editable.contains(selection.anchorNode) &&
            (selection.focusNode === selection.anchorNode ||
                this.editable.contains(selection.focusNode))
        ) {
            this.activeSelection = this.makeSelection(selection, true);
        }
        return this.activeSelection;
    }

    /**
     * Set the selection in the editor.
     *
     * @param { Object } selection
     * @param { Node } selection.anchorNode
     * @param { number } selection.anchorOffset
     * @param { Node } [selection.focusNode=selection.anchorNode]
     * @param { number } [selection.focusOffset=selection.anchorOffset]
     * @param { Object } [options]
     * @param { boolean } [normalize=true] Normalize deep the selection
     * @return { EditorSelection }
     */
    setSelection(
        { anchorNode, anchorOffset, focusNode = anchorNode, focusOffset = anchorOffset },
        { normalize = true } = {}
    ) {
        if (
            !this.editable.contains(anchorNode) ||
            !(anchorNode === focusNode || this.editable.contains(focusNode))
        ) {
            throw new Error("Selection is not in editor");
        }
        const isCollapsed = anchorNode === focusNode && anchorOffset === focusOffset;
        [anchorNode, anchorOffset] = normalizeCursorPosition(anchorNode, anchorOffset, "left");
        [focusNode, focusOffset] = normalizeCursorPosition(focusNode, focusOffset, "right");
        if (normalize) {
            // normalize selection
            [anchorNode, anchorOffset] = normalizeDeepCursorPosition(anchorNode, anchorOffset);
            [focusNode, focusOffset] = isCollapsed
                ? [anchorNode, anchorOffset]
                : normalizeDeepCursorPosition(focusNode, focusOffset);
        }

        [anchorNode, anchorOffset] = normalizeFakeBR(anchorNode, anchorOffset);
        [focusNode, focusOffset] = normalizeFakeBR(focusNode, focusOffset);
        const selection = this.document.getSelection();
        selection.setBaseAndExtent(anchorNode, anchorOffset, focusNode, focusOffset);

        this.activeSelection = this.makeSelection(selection, true);
        return this.activeSelection;
    }

    /**
     * Set the cursor at the start of the given node.
     * @param { Node } node
     */
    setCursorStart(node) {
        return this.setSelection({ anchorNode: node, anchorOffset: 0 });
    }

    /**
     * Set the cursor at the end of the given node.
     * @param { Node } node
     */
    setCursorEnd(node) {
        return this.setSelection({ anchorNode: node, anchorOffset: nodeSize(node) });
    }
}
