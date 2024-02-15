import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { Plugin } from "../plugin";
import { isBlock } from "../utils/blocks";
import { isRow } from "../utils/dom_info";
import { splitElement, splitTextNode } from "../utils/dom_split";
import { closestElement } from "../utils/dom_traversal";
import { parseHTML } from "../utils/html";
import { DIRECTIONS, nodeSize, rightPos } from "../utils/position";
import { findInSelection, getDeepRange } from "../utils/selection";
import { getColumnIndex, getRowIndex } from "../utils/table";
import { TablePicker } from "./table_picker";

export class TablePlugin extends Plugin {
    static name = "table";
    static dependencies = ["dom", "history", "overlay", "selection"];
    static resources = (p) => ({
        delete_element_backward_before: { callback: p.deleteBackwardBefore.bind(p) },
        handle_tab: { callback: p.handleTab.bind(p), sequence: 20 },
        handle_shift_tab: { callback: p.handleShiftTab.bind(p), sequence: 20 },
        delete_range_before: { callback: p.deleteRangeBefore.bind(p) },
        powerboxCommands: [
            {
                name: _t("Table"),
                description: _t("Insert a table"),
                category: "structure",
                fontawesome: "fa-table",
                action(dispatch) {
                    dispatch("OPEN_TABLE_PICKER");
                },
            },
        ],
    });

    setup() {
        /** @type {import("../core/overlay_plugin").Overlay} */
        this.picker = this.shared.createOverlay(TablePicker, "bottom", {
            dispatch: this.dispatch,
            el: this.editable,
        });
    }

    handleCommand(command, payload) {
        switch (command) {
            case "OPEN_TABLE_PICKER":
                this.openPicker();
                break;
            case "INSERT_TABLE":
                this.insertTable(payload);
                break;
            case "ADD_COLUMN":
                this.addColumn(payload);
                break;
            case "ADD_ROW":
                this.addRow(payload);
                break;
            case "REMOVE_COLUMN":
                this.removeColumn(payload);
                break;
            case "REMOVE_ROW":
                this.removeRow(payload);
                break;
            case "RESET_SIZE":
                this.resetSize(payload);
                break;
            case "DELETE_TABLE":
                this.deleteTable(payload);
                break;
        }
    }

    handleTab() {
        const selection = this.shared.getEditableSelection();
        const inTable = closestElement(selection.anchorNode, "table");
        if (inTable) {
            // Move cursor to next cell.
            const shouldAddNewRow = !this.shiftCursorToTableCell(1);
            if (shouldAddNewRow) {
                this.addRow({ position: "after" });
                this.shiftCursorToTableCell(1);
            }
            return true;
        }
    }

    handleShiftTab() {
        const selection = this.shared.getEditableSelection();
        const inTable = closestElement(selection.anchorNode, "table");
        if (inTable) {
            // Move cursor to previous cell.
            this.shiftCursorToTableCell(-1);
            return true;
        }
    }

    openPicker() {
        const range = getSelection().getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0 && rect.x === 0) {
            range.startContainer.parentElement.appendChild(this.document.createElement("br"));
        }
        this.picker.open();
    }

    insertTable({ rows = 2, cols = 2 } = {}) {
        const tdsHtml = new Array(cols).fill("<td><p><br></p></td>").join("");
        const trsHtml = new Array(rows).fill(`<tr>${tdsHtml}</tr>`).join("");
        const tableHtml = `<table class="table table-bordered o_table"><tbody>${trsHtml}</tbody></table>`;
        let sel = this.shared.getEditableSelection();
        if (!sel.isCollapsed) {
            this.dispatch("DELETE_RANGE", sel);
        }
        while (!isBlock(sel.anchorNode)) {
            const anchorNode = sel.anchorNode;
            const isTextNode = anchorNode.nodeType === Node.TEXT_NODE;
            const newAnchorNode = isTextNode
                ? splitTextNode(anchorNode, sel.anchorOffset, DIRECTIONS.LEFT) + 1 && anchorNode
                : splitElement(anchorNode, sel.anchorOffset).shift();
            const newPosition = rightPos(newAnchorNode);
            sel = this.shared.setSelection(
                { anchorNode: newPosition[0], anchorOffset: newPosition[1] },
                false
            );
        }
        const [table] = this.shared.dom_insert(parseHTML(this.document, tableHtml));
        this.shared.setCursorStart(table.querySelector("p"));
    }
    addColumn({ position, reference } = {}) {
        if (!reference) {
            getDeepRange(this.editable, { select: true }); // Ensure deep range for finding td.
            reference = findInSelection(this.shared.getEditableSelection(), "td");
            if (!reference) {
                return;
            }
        }
        const columnIndex = getColumnIndex(reference);
        const table = closestElement(reference, "table");
        const tableWidth = table.style.width ? parseFloat(table.style.width) : table.clientWidth;
        const referenceColumn = table.querySelectorAll(`tr td:nth-of-type(${columnIndex + 1})`);
        const referenceCellWidth = reference.style.width
            ? parseFloat(reference.style.width)
            : reference.clientWidth;
        // Temporarily set widths so proportions are respected.
        const firstRow = table.querySelector("tr");
        const firstRowCells = [...firstRow.children].filter(
            (child) => child.nodeName === "TD" || child.nodeName === "TH"
        );
        let totalWidth = 0;
        for (const cell of firstRowCells) {
            const width = cell.style.width ? parseFloat(cell.style.width) : cell.clientWidth;
            cell.style.width = width + "px";
            // Spread the widths to preserve proportions.
            // -1 for the width of the border of the new column.
            const newWidth = Math.max(
                Math.round((width * tableWidth) / (tableWidth + referenceCellWidth - 1)),
                13
            );
            cell.style.width = newWidth + "px";
            totalWidth += newWidth;
        }
        referenceColumn.forEach((cell, rowIndex) => {
            const newCell = this.document.createElement("td");
            const p = this.document.createElement("p");
            p.append(this.document.createElement("br"));
            newCell.append(p);
            cell[position](newCell);
            if (rowIndex === 0) {
                newCell.style.width = cell.style.width;
                totalWidth += parseFloat(cell.style.width);
            }
        });
        if (totalWidth !== tableWidth - 1) {
            // -1 for the width of the border of the new column.
            firstRowCells[firstRowCells.length - 1].style.width =
                parseFloat(firstRowCells[firstRowCells.length - 1].style.width) +
                (tableWidth - totalWidth - 1) +
                "px";
        }
        // Fix the table and row's width so it doesn't change.
        table.style.width = tableWidth + "px";
    }
    addRow({ position, reference } = {}) {
        if (!reference) {
            getDeepRange(this.editable, { select: true }); // Ensure deep range for finding tr.
            reference = findInSelection(this.shared.getEditableSelection(), "tr");
            if (!reference) {
                return;
            }
        }
        const referenceRowHeight = reference.style.height
            ? parseFloat(reference.style.height)
            : reference.clientHeight;
        const newRow = this.document.createElement("tr");
        newRow.style.height = referenceRowHeight + "px";
        const cells = reference.querySelectorAll("td");
        const referenceRowWidths = [...cells].map(
            (cell) => cell.style.width || cell.clientWidth + "px"
        );
        newRow.append(
            ...Array.from(Array(cells.length)).map(() => {
                const td = this.document.createElement("td");
                const p = this.document.createElement("p");
                p.append(this.document.createElement("br"));
                td.append(p);
                return td;
            })
        );
        reference[position](newRow);
        newRow.style.height = referenceRowHeight + "px";
        // Preserve the width of the columns (applied only on the first row).
        if (getRowIndex(newRow) === 0) {
            let columnIndex = 0;
            for (const column of newRow.children) {
                column.style.width = referenceRowWidths[columnIndex];
                cells[columnIndex].style.width = "";
                columnIndex++;
            }
        }
    }
    removeColumn(cell) {
        if (!cell) {
            getDeepRange(this.editable, { select: true }); // Ensure deep range for finding td.
            cell = findInSelection(this.shared.getEditableSelection(), "td");
            if (!cell) {
                return;
            }
        }
        const table = closestElement(cell, "table");
        const cells = [...closestElement(cell, "tr").querySelectorAll("th, td")];
        const index = cells.findIndex((td) => td === cell);
        const siblingCell = cells[index - 1] || cells[index + 1];
        table.querySelectorAll(`tr td:nth-of-type(${index + 1})`).forEach((td) => td.remove());
        // @todo @phoenix should I call dispatch('DELETE_TABLE', table) or this.deleteTable?
        siblingCell
            ? this.shared.setCursorStart(siblingCell)
            : this.dispatch("DELETE_TABLE", table);
    }
    removeRow(row) {
        if (!row) {
            getDeepRange(this.editable, { select: true }); // Ensure deep range for finding tr.
            row = findInSelection(this.shared.getEditableSelection(), "tr");
            if (!row) {
                return;
            }
        }
        const table = closestElement(row, "table");
        const rows = [...table.querySelectorAll("tr")];
        const rowIndex = rows.findIndex((tr) => tr === row);
        const siblingRow = rows[rowIndex - 1] || rows[rowIndex + 1];
        row.remove();
        siblingRow
            ? this.shared.setCursorStart({ anchorNode: siblingRow, anchorOffset: 0 })
            : this.dispatch("DELETE_TABLE", table);
    }
    resetSize(table) {
        if (!table) {
            getDeepRange(this.editable, { select: true });
            table = findInSelection(this.shared.getEditableSelection(), "table");
        }
        table.removeAttribute("style");
        const cells = [...table.querySelectorAll("tr, td")];
        cells.forEach((cell) => {
            const cStyle = cell.style;
            if (cell.tagName === "TR") {
                cStyle.height = "";
            } else {
                cStyle.width = "";
            }
        });
    }
    deleteTable(table) {
        table = table || findInSelection(this.shared.getEditableSelection(), "table");
        if (!table) {
            return;
        }
        const p = this.document.createElement("p");
        p.appendChild(this.document.createElement("br"));
        table.before(p);
        table.remove();
        this.shared.setCursorStart(p);
    }
    deleteBackwardBefore({ targetNode, targetOffset }) {
        // If the cursor is at the beginning of a row, prevent deletion.
        if (targetNode.nodeType === Node.ELEMENT_NODE && isRow(targetNode) && !targetOffset) {
            return true;
        }
    }

    // @todo @phoenix to implement
    deleteRangeBefore() {}

    // @todo @phoenix This could be usefull for handling arrow up and down in tables (spec change?).
    /**
     * Moves the cursor by shiftIndex table cells.
     *
     * @param {Number} shiftIndex - The index to shift the cursor by.
     * @returns {boolean} - True if the cursor was successfully moved, false otherwise.
     */
    shiftCursorToTableCell(shiftIndex) {
        const sel = this.shared.getEditableSelection();
        const currentTd = closestElement(sel.anchorNode, "td");
        const closestTable = closestElement(currentTd, "table");
        if (!currentTd || !closestTable) {
            return false;
        }
        const tds = [...closestTable.querySelectorAll("td")];
        const cursorDestination = tds[tds.findIndex((td) => currentTd === td) + shiftIndex];
        if (!cursorDestination) {
            return false;
        }
        this.shared.setSelection({
            anchorNode: cursorDestination,
            anchorOffset: 0,
            focusNode: cursorDestination,
            focusOffset: nodeSize(cursorDestination),
        });
        return true;
    }
}

registry.category("phoenix_plugins").add(TablePlugin.name, TablePlugin);
