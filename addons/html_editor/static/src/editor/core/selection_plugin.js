import { registry } from "@web/core/registry";
import { Plugin } from "../plugin";
import { DIRECTIONS, nodeSize } from "../utils/position";
import { getNormalizedCursorPosition } from "../utils/selection";

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
 * @property { () => boolean } isDomSelectionInEditable
 */

export class SelectionPlugin extends Plugin {
    static name = "selection";
    static shared = ["getEditableSelection", "setSelection", "setCursorStart", "setCursorEnd"];

    setup() {
        this.activeSelection = this.makeSelection(false);
        this.addDomListener(this.document, "selectionchange", this.updateActiveSelection);
    }

    /**
     * Update the active selection to the current selection in the editor.
     */
    updateActiveSelection() {
        const selection = this.document.getSelection();
        if (selection.rangeCount === 0) {
            return;
        }
        const range = selection.getRangeAt(0);
        if (this.editable.contains(range.commonAncestorContainer)) {
            // selection is in editor, need to update local copy
            this.activeSelection = this.makeSelection(selection);
            for (const handler of this.resources.onSelectionChange) {
                handler(this.activeSelection);
            }
        }
    }

    /**
     * @param { Selection } selection The DOM selection
     * @return { EditorSelection }
     */
    makeSelection(selection) {
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
            isDomSelectionInEditable: () => {
                const selection = this.document.getSelection();
                return (
                    selection.rangeCount > 0 &&
                    this.editable.contains(selection.getRangeAt(0).commonAncestorContainer)
                );
            },
        };

        Object.freeze(activeSelection);
        return activeSelection;
    }

    /**
     * @return { EditorSelection }
     */
    getEditableSelection() {
        const selection = this.document.getSelection();
        if (
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
     * @param { boolean } [normalize=true] Normalize the selection
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
        if (normalize) {
            // normalize selection
            const isCollapsed = anchorNode === focusNode && anchorOffset === focusOffset;
            [anchorNode, anchorOffset] = getNormalizedCursorPosition(anchorNode, anchorOffset);
            [focusNode, focusOffset] = isCollapsed
                ? [anchorNode, anchorOffset]
                : getNormalizedCursorPosition(focusNode, focusOffset);
        }

        const selection = this.document.getSelection();
        selection.setBaseAndExtent(anchorNode, anchorOffset, focusNode, focusOffset);

        this.activeSelection = this.makeSelection(selection);
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

registry.category("phoenix_plugins").add(SelectionPlugin.name, SelectionPlugin);
