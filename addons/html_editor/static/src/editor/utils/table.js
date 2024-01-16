/** @odoo-module */

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
    const trParent = tr && tr.parentElement;
    if (!trParent) {
        return -1;
    }
    const trSiblings = [...trParent.children].filter((child) => child.nodeName === "TR");
    return trSiblings.findIndex((child) => child === tr);
}

/**
 * Get the index of the given table cell.
 *
 * @private
 * @param {HTMLTableCellElement} td
 * @returns {number}
 */
export function getColumnIndex(td) {
    const tdParent = td.parentElement;
    if (!tdParent) {
        return -1;
    }
    const tdSiblings = [...tdParent.children].filter(
        (child) => child.nodeName === "TD" || child.nodeName === "TH"
    );
    return tdSiblings.findIndex((child) => child === td);
}
