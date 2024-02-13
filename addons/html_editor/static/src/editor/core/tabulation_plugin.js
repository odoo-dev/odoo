import { registry } from "@web/core/registry";
import { Plugin } from "../plugin";
import { isEditorTab, isZWS } from "../utils/dom_info";
import { splitTextNode } from "../utils/dom_split";
import { descendants, getAdjacentPreviousSiblings } from "../utils/dom_traversal";
import { parseHTML } from "../utils/html";
import { DIRECTIONS } from "../utils/position";
import { getTraversedBlocks } from "../utils/selection";

const tabHtml = '<span class="oe-tabs" contenteditable="false">\u0009</span>\u200B';
const GRID_COLUMN_WIDTH = 40; //@todo Configurable?

/**
 * Checks if the given tab element represents an indentation.
 * An indentation tab is one that is not preceded by visible text.
 *
 * @param {HTMLElement} tab - The tab element to check.
 * @returns {boolean} - True if the tab represents an indentation, false otherwise.
 */
function isIndentationTab(tab) {
    return !getAdjacentPreviousSiblings(tab).some(
        (sibling) =>
            sibling.nodeType === Node.TEXT_NODE && !/^[\u200B\s]*$/.test(sibling.textContent)
    );
}

export class TabulationPlugin extends Plugin {
    static name = "tabulation";
    static dependencies = ["dom", "selection"];
    static shared = ["indentBlocks", "outdentBlocks"];
    static resources = () => ({
        shortcuts: [
            { hotkey: "tab", command: "TAB" },
            { hotkey: "shift+tab", command: "SHIFT_TAB" },
        ],
    });

    setup() {
        for (const tab of this.editable.querySelectorAll(".oe-tabs")) {
            tab.setAttribute("contenteditable", "false");
        }
        this.resources["handle_tab"].sort((a, b) => a.sequence - b.sequence);
        this.resources["handle_shift_tab"].sort((a, b) => a.sequence - b.sequence);
    }

    handleCommand(command, payload) {
        switch (command) {
            case "TAB":
                this.handleTab();
                break;
            case "SHIFT_TAB":
                this.handleShiftTab();
                break;
            case "NORMALIZE": {
                const root = payload;
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
        for (const { callback } of this.resources["handle_tab"]) {
            if (callback()) {
                return;
            }
        }

        const selection = this.shared.getEditableSelection();
        if (selection.isCollapsed) {
            this.insertTab();
        } else {
            const traversedBlocks = getTraversedBlocks(this.editable);
            this.indentBlocks(traversedBlocks);
        }
        this.dispatch("ADD_STEP");
    }

    handleShiftTab() {
        for (const { callback } of this.resources["handle_shift_tab"]) {
            if (callback()) {
                return;
            }
        }
        const traversedBlocks = getTraversedBlocks(this.editable);
        this.outdentBlocks(traversedBlocks);
        this.dispatch("ADD_STEP");
    }

    insertTab() {
        this.shared.dom_insert(parseHTML(this.document, tabHtml));
    }

    indentBlocks(blocks) {
        const selectionToRestore = this.shared.getEditableSelection();
        const tab = parseHTML(this.document, tabHtml);
        for (const block of blocks) {
            block.prepend(tab.cloneNode(true));
        }
        this.shared.setSelection(
            selectionToRestore.anchorNode,
            selectionToRestore.anchorOffset,
            selectionToRestore.focusNode,
            selectionToRestore.focusOffset,
            false
        );
    }

    outdentBlocks(blocks) {
        for (const block of blocks) {
            const firstTab = descendants(block).find(isEditorTab);
            if (firstTab && isIndentationTab(firstTab)) {
                this.removeTrailingZWS(firstTab);
                firstTab.remove();
            }
        }
    }

    removeTrailingZWS(tab) {
        const selection = this.shared.getEditableSelection();
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
            this.shared.setSelection(
                updateAnchor ? tab.nextSibling : anchorNode,
                updateAnchor ? Math.max(0, anchorOffset - zwsRemoved) : anchorOffset,
                updateFocus ? tab.nextSibling : focusNode,
                updateFocus ? Math.max(0, focusOffset - zwsRemoved) : focusOffset
            );
        }
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
