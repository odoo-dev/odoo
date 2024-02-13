import { registry } from "@web/core/registry";
import { Plugin } from "../plugin";
import { closestElement } from "../utils/dom_traversal";
import { unwrapContents } from "../utils/dom";
import { closestBlock } from "../utils/blocks";
import { isEmpty } from "../utils/dom_info";

const REGEX_BOOTSTRAP_COLUMN = /(?:^| )col(-[a-zA-Z]+)?(-\d+)?(?:$| )/;

// @todo @phoenix: the powerbox plugin puts a hint first on the empty paragraph,
// this currently has no effect
function targetForHint(selection) {
    let node = selection.anchorNode;
    if (node.nodeType === Node.TEXT_NODE) {
        node = node.parentElement;
    }
    return node.matches(".o_text_columns p") && isEmpty(node) && node;
}

export class ColumnPlugin extends Plugin {
    static name = "column";
    static dependencies = ["selection"];
    static resources = () => ({
        temp_hints: {
            text: "New column...",
            target: targetForHint,
        },
    });

    handleCommand(command, payload) {
        switch (command) {
            case "COLUMNIZE": {
                const { numberOfColumns, addParagraphAfter } = payload;
                this.columnize(numberOfColumns, addParagraphAfter);
                break;
            }
        }
    }
    columnize(numberOfColumns, addParagraphAfter = true) {
        const selectionToRestore = this.shared.getEditableSelection();
        const anchor = selectionToRestore.anchorNode;
        const hasColumns = !!closestElement(anchor, ".o_text_columns");
        if (hasColumns) {
            if (numberOfColumns) {
                this.changeColumnsNumber(anchor, numberOfColumns);
            } else {
                this.removeColumns(anchor);
            }
        } else if (numberOfColumns) {
            this.createColumns(anchor, numberOfColumns, addParagraphAfter);
        }
        this.shared.setSelection(selectionToRestore);
    }

    removeColumns(anchor) {
        const container = closestElement(anchor, ".o_text_columns");
        const rows = unwrapContents(container);
        for (const row of rows) {
            const columns = unwrapContents(row);
            for (const column of columns) {
                unwrapContents(column);
                // const columnContents = unwrapContents(column);
                // for (const node of columnContents) {
                //     resetOuids(node);
                // }
            }
        }
    }

    createColumns(anchor, numberOfColumns, addParagraphAfter) {
        const container = this.document.createElement("div");
        if (!closestElement(anchor, ".container")) {
            container.classList.add("container");
        }
        container.classList.add("o_text_columns");
        const row = this.document.createElement("div");
        row.classList.add("row");
        container.append(row);
        const block = closestBlock(anchor);
        // resetOuids(block);
        const columnSize = Math.floor(12 / numberOfColumns);
        const columns = [];
        for (let i = 0; i < numberOfColumns; i++) {
            const column = this.document.createElement("div");
            column.classList.add(`col-${columnSize}`);
            row.append(column);
            columns.push(column);
        }
        block.before(container);
        columns.shift().append(block);
        for (const column of columns) {
            const p = this.document.createElement("p");
            p.append(this.document.createElement("br"));
            // @todo @phoenix: move this to hint plugin
            // p.classList.add("oe-hint");
            // p.setAttribute("placeholder", "New column...");
            column.append(p);
        }
        if (addParagraphAfter) {
            const p = this.document.createElement("p");
            p.append(this.document.createElement("br"));
            container.after(p);
        }
    }

    changeColumnsNumber(anchor, numberOfColumns) {
        const row = closestElement(anchor, ".row");
        const columns = [...row.children];
        const columnSize = Math.floor(12 / numberOfColumns);
        const diff = numberOfColumns - columns.length;
        if (!diff) {
            return;
        }
        for (const column of columns) {
            column.className = column.className.replace(
                REGEX_BOOTSTRAP_COLUMN,
                `col$1-${columnSize}`
            );
        }
        if (diff > 0) {
            // Add extra columns.
            let lastColumn = columns[columns.length - 1];
            for (let i = 0; i < diff; i++) {
                const column = this.document.createElement("div");
                column.classList.add(`col-${columnSize}`);
                const p = this.document.createElement("p");
                p.append(this.document.createElement("br"));
                // @todo @phoenix: move this to hint plugin
                // p.classList.add("oe-hint");
                // p.setAttribute("placeholder", "New column...");
                column.append(p);
                lastColumn.after(column);
                lastColumn = column;
            }
        } else if (diff < 0) {
            // Remove superfluous columns.
            const contents = [];
            for (let i = diff; i < 0; i++) {
                const column = columns.pop();
                const columnContents = unwrapContents(column);
                // for (const node of columnContents) {
                //     resetOuids(node);
                // }
                contents.unshift(...columnContents);
            }
            columns[columns.length - 1].append(...contents);
        }
    }
}

registry.category("phoenix_plugins").add(ColumnPlugin.name, ColumnPlugin);
