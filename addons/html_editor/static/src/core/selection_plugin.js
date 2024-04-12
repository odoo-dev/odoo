import { getDeepestPosition } from "@html_editor/utils/dom_info";
import { splitTextNode } from "@html_editor/utils/dom_split";
import { Plugin } from "../plugin";
import { DIRECTIONS, endPos, nodeSize } from "../utils/position";
import {
    getTraversedNodes,
    normalizeCursorPosition,
    normalizeDeepCursorPosition,
    normalizeFakeBR,
} from "../utils/selection";
import { closestElement, descendants } from "@html_editor/utils/dom_traversal";

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
        "splitSelection",
        "extractContent",
        "preserveSelection",
        "resetSelection",
        "getSelectedNodes",
    ];

    setup() {
        this.resetSelection();
        this.addDomListener(this.document, "selectionchange", this.updateActiveSelection);
        this.addDomListener(this.editable, "click", (ev) => {
            if (ev.detail >= 3) {
                const { anchorNode, anchorOffset } = this.getEditableSelection();
                const [focusNode, focusOffset] = endPos(anchorNode);
                this.setSelection({ anchorNode, anchorOffset, focusNode, focusOffset });
            }
        });
    }

    resetSelection() {
        this.activeSelection = this.makeSelection(false, false);
    }

    /**
     * Update the active selection to the current selection in the editor.
     */
    updateActiveSelection() {
        const selection = this.document.getSelection();
        let inEditable;
        if (!selection || selection.rangeCount === 0) {
            inEditable = false;
        } else {
            const range = selection.getRangeAt(0);
            inEditable = this.editable.contains(range.commonAncestorContainer);
        }
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
    makeSelection(selection, inEditable, deep) {
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

    makeDeepSelection() {
        let { anchorNode, anchorOffset, focusNode, focusOffset, isCollapsed, direction } =
            this.activeSelection;
        [anchorNode, anchorOffset] = getDeepestPosition(anchorNode, anchorOffset);
        [focusNode, focusOffset] = isCollapsed
            ? [anchorNode, anchorOffset]
            : getDeepestPosition(focusNode, focusOffset);
        let startContainer, startOffset, endContainer, endOffset;
        if (direction) {
            [startContainer, startOffset] = [anchorNode, anchorOffset];
            [endContainer, endOffset] = [focusNode, focusOffset];
        } else {
            [startContainer, startOffset] = [focusNode, focusOffset];
            [endContainer, endOffset] = [anchorNode, anchorOffset];
        }

        const range = new Range();
        range.setStart(startContainer, startOffset);
        range.setEnd(endContainer, endOffset);
        return Object.freeze({
            ...this.activeSelection,
            anchorNode,
            anchorOffset,
            focusNode,
            focusOffset,
            startContainer,
            startOffset,
            endContainer,
            endOffset,
            commonAncestorContainer: range.commonAncestorContainer,
        });
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
    getEditableSelection(deep = false) {
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
        if (deep) {
            return this.makeDeepSelection();
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

    splitSelection() {
        let { startContainer, startOffset, endContainer, endOffset } = this.getEditableSelection();
        const isInSingleContainer = startContainer === endContainer;
        if (
            endContainer.nodeType === Node.TEXT_NODE &&
            endOffset !== 0 &&
            endOffset !== endContainer.textContent.length
        ) {
            const endParent = endContainer.parentNode;
            const splitOffset = splitTextNode(endContainer, endOffset);
            endContainer = endParent.childNodes[splitOffset - 1] || endParent.firstChild;
            if (isInSingleContainer) {
                startContainer = endContainer;
            }
            endOffset = endContainer.textContent.length;
        }
        if (
            startContainer.nodeType === Node.TEXT_NODE &&
            startOffset !== 0 &&
            startOffset !== startContainer.textContent.length
        ) {
            splitTextNode(startContainer, startOffset);
            startOffset = 0;
            if (isInSingleContainer) {
                endOffset = startContainer.textContent.length;
            }
        }

        return this.setSelection(
            {
                anchorNode: startContainer,
                anchorOffset: startOffset,
                focusNode: endContainer,
                focusOffset: endOffset,
            },
            { normalize: false }
        );
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

    /**
     * Stores the current selection and returns an object with methods to:
     * - update the cursors (anchor and focus) node and offset after DOM
     * manipulations that migh affect them. Such methods are chainable.
     * - restore the updated selection.
     */
    preserveSelection() {
        const selection = this.getEditableSelection();
        const anchor = { node: selection.anchorNode, offset: selection.anchorOffset };
        const focus = { node: selection.focusNode, offset: selection.focusOffset };

        function updateCursors(predicate, action) {
            for (const cursor of [anchor, focus]) {
                if (predicate(cursor)) {
                    action(cursor);
                }
            }
        }
        const nodeToPredicate = (node) => (cursor) => cursor.node === node;

        return {
            restore: () => {
                if (selection.inEditable) {
                    this.setSelection(
                        {
                            anchorNode: anchor.node,
                            anchorOffset: anchor.offset,
                            focusNode: focus.node,
                            focusOffset: focus.offset,
                        },
                        { normalize: false }
                    );
                }
            },
            remapNode(node, newNode) {
                const action = (cursor) => (cursor.node = newNode);
                updateCursors(nodeToPredicate(node), action);
                return this;
            },
            setOffset(node, newOffset) {
                const action = (cursor) => (cursor.offset = newOffset);
                updateCursors(nodeToPredicate(node), action);
                return this;
            },
            shiftOffset(node, shiftOffset) {
                const action = (cursor) => (cursor.offset += shiftOffset);
                updateCursors(nodeToPredicate(node), action);
                return this;
            },
            // More flexible: takes a predicate and a custom action
            /**
             * @param {(cursor: {node, offset}) => boolean} predicate
             * @param {(cursor: {node, offset}) => void} action
             */
            update(predicate, action) {
                updateCursors(predicate, action);
                return this;
            },
        };
    }

    /**
     * Returns an array containing all the nodes fully contained in the selection.
     *
     * @param {Node} editable
     * @returns {Node[]}
     */
    getSelectedNodes() {
        const selection = this.getEditableSelection();
        const range = new Range();
        range.setStart(selection.startContainer, selection.startOffset);
        range.setEnd(selection.endContainer, selection.endOffset);
        return [
            ...new Set(
                getTraversedNodes(this.editable, selection).flatMap((node) => {
                    const td = closestElement(node, ".o_selected_td");
                    if (td) {
                        return descendants(td);
                    } else if (
                        range.isPointInRange(node, 0) &&
                        range.isPointInRange(node, nodeSize(node))
                    ) {
                        return node;
                    } else {
                        return [];
                    }
                })
            ),
        ];
    }
}
