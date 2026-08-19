import { isTableCell } from "./dom_info";
import { closestElement } from "./dom_traversal";

/**
 * Get the index of the given table row/cell.
 *
 * @private
 * @param {HTMLTableRowElement|HTMLTableCellElement} trOrTd
 * @returns {number}
 */
export function getRowIndex(trOrTd) {
    const tr = closestElement(trOrTd, "tr");
    return tr.rowIndex;
}

/**
 * Get the index of the given table cell.
 *
 * @private
 * @param {HTMLTableCellElement} td
 * @returns {number}
 */
export function getColumnIndex(td) {
    return td.cellIndex;
}

/**
 * Get all the cells of given table
 * (excluding nested table cells).
 *
 * @param {HTMLTableElement} table
 * @returns {Array<HTMLTableCellElement>}
 */
export function getTableCells(table) {
    return [...table.querySelectorAll("td, th")].filter(
        (cell) => closestElement(cell, "table") === table
    );
}

/**
 * Analyzes the currently selected table cells and determines:
 *  - whether they can be merged,
 *  - whether they can be unmerged,
 *  - and along which span type (`rowSpan` or `colSpan`) a merge is possible.
 *
 * @param {Document} editableDocument
 * @param {HTMLTableCellElement[][]} tableGrid
 * @param {HTMLTableCellElement} targetCell
 * The table cell currently hovered by the mouse.
 * @returns {Object} An object with the following properties:
 *   - {boolean} canMerge - True if selected cells can be merged.
 *   - {boolean} canUnmerge
 *     True if the anchor or selected table cell has rowSpan or colSpan > 1.
 *   - {Array<HTMLTableCellElement>} selectedCells - The selected cells.
 *   - {"colSpan" | "rowSpan" | ""} spanType - The span type along which
 *     the cells can be merged, or an empty string if merging is not possible.
 */
export function getSelectedCellsMergeInfo(editableDocument, tableGrid, targetCell) {
    const selectedTds = Array.from(editableDocument.querySelectorAll(".o_selected_td"));
    if (selectedTds.length <= 1) {
        const { anchorNode } = editableDocument.getSelection();
        const td = selectedTds[0] ?? (anchorNode && closestElement(anchorNode, isTableCell));
        return {
            canMerge: false,
            canUnmerge: td?.rowSpan > 1 || td?.colSpan > 1,
            cells: [],
            spanType: "",
        };
    }

    const firstCell = selectedTds[0];
    const lastCell = selectedTds[selectedTds.length - 1];

    const table = closestElement(firstCell, "table");
    const isSameTable =
        table &&
        table === closestElement(lastCell, "table") &&
        table === closestElement(targetCell, "table");

    if (!isSameTable) {
        return { canMerge: false, canUnmerge: false, cells: [], spanType: "" };
    }

    const getGridColumnIndex = (cell, row) => tableGrid[row].indexOf(cell);

    const rowIndexes = selectedTds.map(getRowIndex);
    const colIndexes = selectedTds.map((td, i) => getGridColumnIndex(td, rowIndexes[i]));

    const referenceRowIndex = rowIndexes[0];
    const referenceColIndex = colIndexes[0];

    const allInSameRow = rowIndexes.every((r) => r === referenceRowIndex);
    const allInSameCol = colIndexes.every((c) => c === referenceColIndex);
    const containsMergedCell = selectedTds.some((td) => td.rowSpan > 1 || td.colSpan > 1);
    // All in same row + no rowspan
    if (allInSameRow && selectedTds.every((td) => !td.hasAttribute("rowspan"))) {
        return {
            canMerge: true,
            canUnmerge: containsMergedCell,
            cells: selectedTds,
            spanType: "colSpan",
        };
    }

    // All in same col + no colspan
    if (allInSameCol && selectedTds.every((td) => !td.hasAttribute("colspan"))) {
        return {
            canMerge: true,
            canUnmerge: containsMergedCell,
            cells: selectedTds,
            spanType: "rowSpan",
        };
    }

    return { canMerge: false, canUnmerge: containsMergedCell, cells: selectedTds, spanType: "" };
}

export const TABLE_WRAPPER_CLASS = "o_table_wrapper";
export const TABLE_WRAPPER_SELECTOR = `.${TABLE_WRAPPER_CLASS}`;

/**
 * @param {Node} node
 * @returns {boolean}
 */
export function isTableWrapper(node) {
    return !!node?.classList?.contains(TABLE_WRAPPER_CLASS);
}

/**
 * Get the scroll container of the given table, if it has one.
 *
 * @param {HTMLElement} node
 * @returns {HTMLDivElement|null}
 */
export function getTableWrapper(node) {
    if (isTableWrapper(node)) {
        return node;
    }
    // A wrapper only ever wraps its direct child: looking further up would
    // return the wrapper of an ancestor table for a nested one.
    const table = closestElement(node, "table");
    return isTableWrapper(table?.parentElement) ? table.parentElement : null;
}

/**
 * Get the outermost element standing for the given table in the block flow:
 * its scroll container if it has one, the table itself otherwise.
 *
 * @param {Node} node A wrapper, a table, or any node inside a table.
 * @returns {HTMLElement|null}
 */
export function getTableRoot(node) {
    if (isTableWrapper(node)) {
        return node;
    }
    const table = closestElement(node, "table");
    return table ? getTableWrapper(table) ?? table : null;
}

/**
 * Put the given table into a scroll container.
 *
 * @param {HTMLTableElement} table
 * @returns {HTMLDivElement} The wrapper, existing or newly created.
 */
export function wrapTableIntoScrollContainer(table) {
    const existingWrapper = getTableWrapper(table);
    if (existingWrapper) {
        return existingWrapper;
    }
    const wrapper = table.ownerDocument.createElement("div");
    wrapper.classList.add(TABLE_WRAPPER_CLASS);
    // No-op if the table is detached: the wrapper simply takes its place.
    table.replaceWith(wrapper);
    wrapper.appendChild(table);
    return wrapper;
}

/**
 * Compare the given table to the space available to it, and return the update
 * putting its scroll container in the right state: present when the table
 * overflows, absent when it does not.
 *
 * @param {HTMLTableElement} table
 * @returns {Function|undefined} The update, if the container has to change.
 */
export function updateTableScrollContainer(table) {
    if (!table?.classList.contains("o_table") || closestElement(table, isTableCell)) {
        return;
    }
    const wrapper = getTableWrapper(table);
    const container = (wrapper ?? table).parentElement;
    if (!container) {
        return;
    }
    const { paddingLeft, paddingRight } = getComputedStyle(container);
    const availableWidth =
        container.clientWidth - parseFloat(paddingLeft) - parseFloat(paddingRight);
    const overflows = table.offsetWidth > availableWidth;
    if (overflows && !wrapper) {
        wrapTableIntoScrollContainer(table);
        return true;
    }
    if (!overflows && wrapper) {
        wrapper.replaceWith(table);
        return true;
    }
}
