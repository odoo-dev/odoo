/* @odoo-module */
import { appendTo, addLegacyNodeInfo } from "./compile_lib";

/**
 * An object containing various information about the current
 * compilation from an Arch to a owl template.
 * @typedef {Object} CompilationContext
 */

/**
 * If a group node has a string, compile a title div for it
 * @param  {Element} node an arch's node
 * @return {Element}
 */
function makeGroupTitleRow(node) {
    const titleDiv = this.document.createElement("div");
    titleDiv.classList.add("o_horizontal_separator");
    titleDiv.textContent = node.getAttribute("string");
    return titleDiv;
}

/**
 * Compiles a template node for a `<group>`arch's node. Only for first level
 * @param {Object} config
 * @param  {Document} config.document The document from which we can create elements
 * @param  {Function} config.compileNode   A function to compile children nodes
 * @param  {number} [config.outerGroupCol] the default group column
 * @param {Object} params The execution parameters
 * @param  {Element} params.node An arch's node
 * @param  {CompilationContext} params.compilationContext
 * @return {Element} The compiled group node
 */
export function compileGroup(
    { document, compileNode, outerGroupCol },
    { node, compilationContext }
) {
    outerGroupCol = outerGroupCol || 2;

    const group = document.createElement("div");
    group.setAttribute("class", "o_group");

    if (node.hasAttribute("string")) {
        appendTo(group, makeGroupTitleRow(node));
    }

    const nbCols =
        "col" in node.attributes ? parseInt(node.getAttribute("col"), 10) : outerGroupCol;
    const colSize = Math.max(1, Math.round(12 / nbCols));

    compilationContext = Object.create(compilationContext);
    compilationContext.groupLevel = (compilationContext.groupLevel || 1) + 1;
    for (let child of node.children) {
        if (child.tagName === "newline") {
            appendTo(group, this.doc.createElement("br"));
            continue;
        }
        const compiled = compileNode(child, compilationContext);
        if (!compiled) {
            continue;
        }
        const colspan =
            "colspan" in child.attributes ? parseInt(node.getAttribute("colspan"), 10) : 1;

        compiled.classList.add(`o_group_col_${colSize * colspan}`);
        appendTo(group, compiled);
    }
    return group;
}

/**
 * Compiles a template node for a `<widget>`arch's node
 * @param {Object} config
 * @param  {Document} config.document The document from which we can create elements
 * @param {Object} params The execution parameters
 * @param  {Element} params.node An arch's node
 * @return {Element} The compiled ViewWidget node
 */
export function compileWidget({ document }, { node }) {
    const viewWidget = document.createElement("ViewWidget");
    viewWidget.setAttribute("model", "model");
    viewWidget.setAttribute("widgetName", `"${node.getAttribute("name")}"`);
    if ("title" in node.attributes) {
        viewWidget.setAttribute("title", `"${node.getAttribute("title")}"`);
    }
    addLegacyNodeInfo(node, viewWidget);

    return viewWidget;
}

// LPE KEEP SOMEWHERE
/*    compileInnerGroup(node, params) {
        const table = this.doc.createElement("table");
        table.setAttribute("class", "o_group o_inner_group o_group_col_6");
        const tbody = this.doc.createElement("tbody");
        table.appendChild(tbody);

        const colAttr = node.hasAttribute("col")
            ? parseInt(node.getAttribute("col"), 10)
            : this.constructor.INNER_GROUP_COL;

        if (node.hasAttribute("string")) {
            const td = this.doc.createElement("td");
            td.setAttribute("colspan", colAttr);
            td.setAttribute("style", "width: 100%");
            appendTo(td, makeGroupTitleRow(node));
            appendTo(tbody, td);
        }

        const rows = [];
        let currentColspan = 0;
        let currentRow = this.doc.createElement("tr");
        for (let child of node.children) {
            if (child.tagName === "newline") {
                rows.push(currentRow);
                currentRow = this.doc.createElement("tr");
                currentColspan = 0;
                continue;
            }

            let colspan = "colspan" in child.attributes
                ? parseInt(child.getAttribute("colspan"), 10)
                : 0;

            const isLabeledField =
                child.tagName === "field" &&
                !evalIrUiViewModifier(child.getAttribute("nolabel"));

            if (!colspan) {
                if (isLabeledField) {
                    colspan = 2;
                } else {
                    colspan = 1;
                }
            }
            const finalColspan = colspan - (isLabeledField ? 1 : 0);
            currentColspan += colspan;

            if (currentColspan > colAttr) {
                rows.push(currentRow);
                currentRow = this.doc.createElement("tr");
                currentColspan = colspan;
            }


            const tds = [];
            tds.push(...this.compileInnerGroupChild(child, params));
            appendTo(currentRow, tds);
        }

        if (currentRow.childNodes.length) {
            rows.push(currentRow);
        }

        appendTo(tbody, rows);
        return table;
    }*/
