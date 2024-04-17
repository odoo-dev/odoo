import { closestBlock } from "@html_editor/utils/blocks";
import { getDeepestPosition, previousLeaf } from "@html_editor/utils/dom_info";
import { closestElement, descendants } from "@html_editor/utils/dom_traversal";
import { Plugin } from "../plugin";
import { DIRECTIONS, endPos, nodeSize } from "../utils/position";
import {
    normalizeCursorPosition,
    normalizeDeepCursorPosition,
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

/**
 * @typedef {Object} Cursors
 * @property {() => void} restore
 * @property {(callback: (cursor: Cursor) => void) => Cursors} update
 * @property {(node: Node, newNode: Node) => Cursors} remapNode
 * @property {(node: Node, newOffset: number) => Cursors} setOffset
 * @property {(node: Node, shiftOffset: number) => Cursors} shiftOffset
 */

/**
 * @typedef {Object} Cursor
 * @property {Node} node
 * @property {number} offset
 */

export class SelectionPlugin extends Plugin {
    static name = "selection";
    static shared = [
        "getEditableSelection",
        "setSelection",
        "setCursorStart",
        "setCursorEnd",
        "extractContent",
        "preserveSelection",
        "resetSelection",
        "getSelectedNodes",
        "getTraversedNodes",
        "getTraversedBlocks",
        // "collapseIfZWS",
    ];

    setup() {
        this.resetSelection();
        this.addDomListener(this.document, "selectionchange", this.updateActiveSelection);
        this.addDomListener(this.editable, "mousedown", (ev) => {
            if (ev.detail >= 3) {
                this.correctTripleClick = true;
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
            if (this.correctTripleClick) {
                this.correctTripleClick = false;
                let { anchorNode, anchorOffset, focusNode, focusOffset } = selection;
                if (focusOffset === 0 && anchorNode !== focusNode) {
                    [focusNode, focusOffset] = endPos(previousLeaf(focusNode));
                    return this.setSelection({ anchorNode, anchorOffset, focusNode, focusOffset });
                }
            }
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
    getEditableSelection({ deep = false } = {}) {
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
     * @returns {Cursors}
     */
    preserveSelection() {
        const selection = this.getEditableSelection();
        const anchor = { node: selection.anchorNode, offset: selection.anchorOffset };
        const focus = { node: selection.focusNode, offset: selection.focusOffset };

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
            update(callback) {
                callback(anchor);
                callback(focus);
                return this;
            },
            remapNode(node, newNode) {
                return this.update((cursor) => {
                    if (cursor.node === node) {
                        cursor.node = newNode;
                    }
                });
            },
            setOffset(node, newOffset) {
                return this.update((cursor) => {
                    if (cursor.node === node) {
                        cursor.offset = newOffset;
                    }
                });
            },
            shiftOffset(node, shiftOffset) {
                return this.update((cursor) => {
                    if (cursor.node === node) {
                        cursor.offset += shiftOffset;
                    }
                });
            },
        };
    }

    /**
     * Returns an array containing all the nodes fully contained in the selection.
     *
     * @returns {Node[]}
     */
    getSelectedNodes() {
        const selection = this.getEditableSelection();
        const range = new Range();
        range.setStart(selection.startContainer, selection.startOffset);
        range.setEnd(selection.endContainer, selection.endOffset);
        return [
            ...new Set(
                this.getTraversedNodes().flatMap((node) => {
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

    /**
     * Returns an array containing all the nodes traversed when walking the
     * selection.
     *
     * @param {Boolean} deep
     * @returns {Node[]}
     */
    getTraversedNodes({ deep = false } = {}) {
        const selection = this.getEditableSelection({ deep });
        const selectedTableCells = this.editable.querySelectorAll(".o_selected_td");
        const document = this.editable.ownerDocument;
        const iterator = document.createNodeIterator(selection.commonAncestorContainer);
        let node;
        do {
            node = iterator.nextNode();
        } while (
            node &&
            node !== selection.startContainer &&
            !(selectedTableCells.length && node === selectedTableCells[0])
        );
        const traversedNodes = new Set([node, ...descendants(node)]);
        while (node && node !== selection.endContainer) {
            node = iterator.nextNode();
            if (node) {
                const selectedTable = closestElement(node, ".o_selected_table");
                if (selectedTable) {
                    for (const selectedTd of selectedTable.querySelectorAll(".o_selected_td")) {
                        traversedNodes.add(selectedTd);
                        descendants(selectedTd).forEach((descendant) =>
                            traversedNodes.add(descendant)
                        );
                    }
                } else {
                    traversedNodes.add(node);
                }
            }
        }
        return [...traversedNodes];
    }

    /**
     * Returns a Set of traversed blocks within the given range.
     *
     * @returns {Set<HTMLElement>}
     */
    getTraversedBlocks() {
        return new Set(this.getTraversedNodes().map(closestBlock).filter(Boolean));
    }

    // @todo @phoenix we should find a real use case and test it
    // /**
    //  * Set a deep selection that split the text and collapse it if only one ZWS is
    //  * selected.
    //  *
    //  * @returns {boolean} true if the selection has only one ZWS.
    //  */
    // collapseIfZWS() {
    //     const selection = this.getEditableSelection({ deep: true });
    //     if (
    //         selection.startContainer === selection.endContainer &&
    //         selection.startContainer.nodeType === Node.TEXT_NODE &&
    //         selection.startContainer.textContent === "\u200B"
    //     ) {
    //         // We Collapse the selection and bypass deleteRange
    //         // if the range content is only one ZWS.
    //         this.setCursorStart(selection.startContainer);
    //         return true;
    //     }
    //     return false;
    // }
}
