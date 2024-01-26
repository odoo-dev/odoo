/** @odoo-module */

import { Plugin } from "../plugin";
import { registry } from "@web/core/registry";
import { closestBlock } from "../utils/blocks";
import { descendants, getAdjacentPreviousSiblings } from "../utils/dom_traversal";
import { isEditorTab, isZWS } from "../utils/dom_info";
import { splitTextNode } from "../utils/dom_split";
import { DIRECTIONS } from "../utils/position";
import { getTraversedNodes, preserveCursor, setSelection } from "../utils/selection";
import { parseHTML } from "../utils/html";

const tabHtml = '<span class="oe-tabs" contenteditable="false">\u0009</span>\u200B';
const GRID_COLUMN_WIDTH = 40; //@todo Configurable?

export class TabulationPlugin extends Plugin {
    static name = "tabulation";
    static dependencies = ["dom"];
    static shared = ["indentNodes", "outdentNodes"];

    setup() {
        for (const tab of this.editable.querySelectorAll(".oe-tabs")) {
            tab.setAttribute("contenteditable", "false");
        }
    }

    handleCommand(command, payload) {
        switch (command) {
            case "TAB":
                this.handleTab();
                break;
            case "SHIFT_TAB":
                this.handleShiftTab();
                break;
            case "CONTENT_UPDATED": {
                const root = payload;
                // @todo obs: this triggers a new CONTENT_UPDATED with the current historyPlugin.
                this.alignTabs(root);
                break;
            }
            case "CLEAN":
                for (const tab of this.editable.querySelectorAll("span.oe-tabs")) {
                    tab.removeAttribute("contenteditable");
                }
        }
    }

    handleTab() {
        for (const callback of this.registry.category("handle_tab").getAll()) {
            if (callback()) {
                return;
            }
        }

        const selection = this.document.getSelection();
        if (selection.isCollapsed) {
            this.insertTab();
        } else {
            const traversedNodes = getTraversedNodes(this.editable);
            this.indentNodes(traversedNodes);
        }
    }

    handleShiftTab() {
        for (const callback of this.registry.category("handle_shift_tab").getAll()) {
            if (callback()) {
                return;
            }
        }
        const traversedNodes = getTraversedNodes(this.editable);
        this.outdentNodes(traversedNodes);
    }

    insertTab() {
        this.shared.dom_insert(parseHTML(this.document, tabHtml));
    }

    /**
     * @param {Set} nodes
     */
    indentNodes(nodes) {
        const restore = preserveCursor(this.document);
        const tab = parseHTML(this.document, tabHtml);
        for (const block of new Set(
            [...nodes].map((node) => closestBlock(node)).filter((node) => node)
        )) {
            block.prepend(tab.cloneNode(true));
        }
        restore();
    }

    /**
     * @todo understand/rewrite? this method
     * @param {Set} nodes
     */
    outdentNodes(nodes) {
        // @todo check if preserveCursor is needed here.
        const restore = preserveCursor(this.document);
        const editorTabs = new Set(
            [...nodes]
                .map((node) => {
                    const block = closestBlock(node);
                    return descendants(block).find((child) => isEditorTab(child));
                })
                .filter(
                    (node) =>
                        // Filter out tabs preceded by visible text.
                        node &&
                        !getAdjacentPreviousSiblings(node).some(
                            (sibling) =>
                                sibling.nodeType === Node.TEXT_NODE &&
                                !/^[\u200B\s]*$/.test(sibling.textContent)
                        )
                )
        );
        for (const tab of editorTabs) {
            const selection = this.document.getSelection();
            const { anchorNode, anchorOffset, focusNode, focusOffset } = selection;
            const updateAnchor = anchorNode === tab.nextSibling;
            const updateFocus = focusNode === tab.nextSibling;
            let zwsRemoved = 0;
            while (
                tab.nextSibling &&
                tab.nextSibling.nodeType === Node.TEXT_NODE &&
                tab.nextSibling.textContent.startsWith("\u200B")
            ) {
                splitTextNode(tab.nextSibling, 1, DIRECTIONS.LEFT);
                tab.nextSibling.remove();
                zwsRemoved++;
            }
            if (updateAnchor || updateFocus) {
                setSelection(
                    updateAnchor ? tab.nextSibling : anchorNode,
                    updateAnchor ? Math.max(0, anchorOffset - zwsRemoved) : anchorOffset,
                    updateFocus ? tab.nextSibling : focusNode,
                    updateFocus ? Math.max(0, focusOffset - zwsRemoved) : focusOffset
                );
            }
            tab.remove();
        }
        restore();
    }

    /**
     * @param {HTMLSpanElement} tabSpan - span.oe-tabs element
     */
    adjustTabWidth(tabSpan) {
        let tabPreviousSibling = tabSpan.previousSibling;
        while (isZWS(tabPreviousSibling)) {
            tabPreviousSibling = tabPreviousSibling.previousSibling;
        }
        if (isEditorTab(tabPreviousSibling)) {
            tabSpan.style.width = `${GRID_COLUMN_WIDTH}px`;
            return;
        }
        const spanRect = tabSpan.getBoundingClientRect();
        const referenceRect = this.editable.firstElementChild?.getBoundingClientRect();
        // @ todo @phoenix Re-evaluate if this check is necessary.
        // Values from getBoundingClientRect() are all zeros during
        // Editor startup or saving. We cannot recalculate the tabs
        // width in thoses cases.
        if (!referenceRect?.width || !spanRect.width) {
            return;
        }
        const relativePosition = spanRect.left - referenceRect.left;
        const distToNextGridLine = GRID_COLUMN_WIDTH - (relativePosition % GRID_COLUMN_WIDTH);
        // Round to the first decimal point.
        const width = distToNextGridLine.toFixed(1);
        tabSpan.style.width = `${width}px`;
    }

    /**
     * Aligns the tabs under the specified tree to a grid.
     *
     * @param {HTMLElement} [root] - The tree root.
     */
    alignTabs(root = this.editable) {
        for (const tab of root.querySelectorAll("span.oe-tabs")) {
            this.adjustTabWidth(tab);
        }
    }
}

registry.category("phoenix_plugins").add(TabulationPlugin.name, TabulationPlugin);
