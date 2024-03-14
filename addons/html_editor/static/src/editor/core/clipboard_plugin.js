import { registry } from "@web/core/registry";
import { Plugin } from "../plugin";
import { parseHTML } from "../utils/html";
import { ancestors, closestElement } from "../utils/dom_traversal";
import { closestBlock, isBlock } from "../utils/blocks";

export const CLIPBOARD_WHITELISTS = {
    nodes: [
        // Style
        "P",
        "H1",
        "H2",
        "H3",
        "H4",
        "H5",
        "H6",
        "BLOCKQUOTE",
        "PRE",
        // List
        "UL",
        "OL",
        "LI",
        // Inline style
        "I",
        "B",
        "U",
        "S",
        "EM",
        "FONT",
        "STRONG",
        // Table
        "TABLE",
        "THEAD",
        "TH",
        "TBODY",
        "TR",
        "TD",
        // Miscellaneous
        "IMG",
        "BR",
        "A",
        ".fa",
    ],
    classes: [
        // Media
        /^float-/,
        "d-block",
        "mx-auto",
        "img-fluid",
        "img-thumbnail",
        "rounded",
        "rounded-circle",
        "table",
        "table-bordered",
        /^padding-/,
        /^shadow/,
        // Odoo colors
        /^text-o-/,
        /^bg-o-/,
        // Odoo lists
        "o_checked",
        "o_checklist",
        "oe-nested",
        // Miscellaneous
        /^btn/,
        /^fa/,
    ],
    attributes: ["class", "href", "src", "target"],
    styledTags: ["SPAN", "B", "STRONG", "I", "S", "U", "FONT", "TD"],
};

export class ClipboardPlugin extends Plugin {
    static name = "clipboard";
    static dependencies = ["dom", "selection"];

    setup() {
        this.addDomListener(this.editable, "paste", this.onPaste);
        this.addDomListener(this.editable, "copy", this.onCopy);
        this.addDomListener(this.editable, "cut", this.onCut);
    }

    onCut(ev) {
        this.onCopy(ev);
        this.dispatch("HISTORY_STAGE_SELECTION");
        this.dispatch("DELETE_RANGE");
        this.dispatch("ADD_STEP");
    }

    /**
     * @param {ClipboardEvent} ev
     */
    onCopy(ev) {
        ev.preventDefault();
        // @todo @phoenix maybe use the new Selection class
        this.shared.setSelection(this.shared.getEditableSelection());
        const selection = this.document.getSelection();
        const range = selection.getRangeAt(0);
        let rangeContent = range.cloneContents();
        if (!rangeContent.hasChildNodes()) {
            return;
        }
        // Repair the copied range.
        if (rangeContent.firstChild.nodeName === "LI") {
            const list = range.commonAncestorContainer.cloneNode();
            list.replaceChildren(...rangeContent.childNodes);
            rangeContent = list;
        }
        if (
            rangeContent.firstChild.nodeName === "TR" ||
            rangeContent.firstChild.nodeName === "TD"
        ) {
            // We enter this case only if selection is within single table.
            const table = closestElement(range.commonAncestorContainer, "table");
            const tableClone = table.cloneNode(true);
            // A table is considered fully selected if it is nested inside a
            // cell that is itself selected, or if all its own cells are
            // selected.
            const isTableFullySelected =
                (table.parentElement &&
                    !!closestElement(table.parentElement, "td.o_selected_td")) ||
                [...table.querySelectorAll("td")]
                    .filter((td) => closestElement(td, "table") === table)
                    .every((td) => td.classList.contains("o_selected_td"));
            if (!isTableFullySelected) {
                for (const td of tableClone.querySelectorAll("td:not(.o_selected_td)")) {
                    if (closestElement(td, "table") === tableClone) {
                        // ignore nested
                        td.remove();
                    }
                }
                const trsWithoutTd = Array.from(tableClone.querySelectorAll("tr")).filter(
                    (row) => !row.querySelector("td")
                );
                for (const tr of trsWithoutTd) {
                    if (closestElement(tr, "table") === tableClone) {
                        // ignore nested
                        tr.remove();
                    }
                }
            }
            // If it is fully selected, clone the whole table rather than
            // just its rows.
            rangeContent = tableClone;
        }
        const table = closestElement(range.startContainer, "table");
        if (rangeContent.firstChild.nodeName === "TABLE" && table) {
            // Make sure the full leading table is copied.
            rangeContent.firstChild.after(table.cloneNode(true));
            rangeContent.firstChild.remove();
        }
        if (rangeContent.lastChild.nodeName === "TABLE") {
            // Make sure the full trailing table is copied.
            rangeContent.lastChild.before(
                closestElement(range.endContainer, "table").cloneNode(true)
            );
            rangeContent.lastChild.remove();
        }

        const commonAncestorElement = closestElement(range.commonAncestorContainer);
        if (commonAncestorElement && !isBlock(rangeContent.firstChild)) {
            // Get the list of ancestor elements starting from the provided
            // commonAncestorElement up to the block-level element.
            const blockEl = closestBlock(commonAncestorElement);
            const ancestorsList = [
                commonAncestorElement,
                ...ancestors(commonAncestorElement, blockEl),
            ];
            // Wrap rangeContent with clones of their ancestors to keep the styles.
            for (const ancestor of ancestorsList) {
                const clone = ancestor.cloneNode();
                clone.append(...rangeContent.childNodes);
                rangeContent.appendChild(clone);
            }
        }
        const dataHtmlElement = document.createElement("data");
        dataHtmlElement.append(rangeContent);
        const odooHtml = dataHtmlElement.innerHTML;
        const odooText = selection.toString();
        ev.clipboardData.setData("text/plain", odooText);
        ev.clipboardData.setData("text/html", odooHtml);
        ev.clipboardData.setData("text/odoo-editor", odooHtml);
    }

    /**
     * @param {ClipboardEvent} ev
     */
    onPaste(ev) {
        const types = new Set(ev.clipboardData.types);
        if (types.has("text/html")) {
            const html = ev.clipboardData.getData("text/html");
            this.pasteHtml(html);
        } else if (types.has("text/plain")) {
            const text = ev.clipboardData.getData("text/plain");
            this.pasteText(text);
        }
        ev.preventDefault();
    }

    /**
     * @param {string} text
     */
    pasteText(text) {
        // Replace consecutive spaces by alternating nbsp.
        const modifiedText = text.replace(/( {2,})/g, (match) => {
            let alertnateValue = false;
            return match.replace(/ /g, () => {
                alertnateValue = !alertnateValue;
                const replaceContent = alertnateValue ? "\u00A0" : " ";
                return replaceContent;
            });
        });
        this.shared.domInsert(modifiedText);
        this.dispatch("ADD_STEP");
    }

    pasteHtml(html) {
        const fragment = parseHTML(this.document, html);
        this.shared.domInsert(fragment);
        this.dispatch("ADD_STEP");
    }
}

registry.category("phoenix_plugins").add(ClipboardPlugin.name, ClipboardPlugin);
