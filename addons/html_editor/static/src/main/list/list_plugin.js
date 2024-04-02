import { _t } from "@web/core/l10n/translation";
import { Plugin } from "@html_editor/plugin";
import { closestBlock, isBlock } from "@html_editor/utils/blocks";
import {
    copyAttributes,
    removeClass,
    setTagName,
    toggleClass,
    unwrapContents,
} from "@html_editor/utils/dom";
import { isEmptyBlock, isVisible } from "@html_editor/utils/dom_info";
import { closestElement, descendants, getAdjacents } from "@html_editor/utils/dom_traversal";
import { getTraversedBlocks } from "@html_editor/utils/selection";
import { applyToTree, compareListTypes, createList, getListMode, insertListAfter } from "./utils";

// @todo @phoenix: isFormatApplied for toolbar buttons should probably
// get a selection as parameter instead of the editable.
function isListActive(listMode) {
    return function (editable) {
        // @todo @phoenix get selection from the dom plugin?
        const selection = editable.ownerDocument.getSelection();
        const block = closestBlock(selection.anchorNode);
        return block?.tagName === "LI" && getListMode(block.parentNode) === listMode;
    };
}

export class ListPlugin extends Plugin {
    static name = "list";
    static dependencies = ["tabulation", "split", "selection", "delete"];
    static resources = (p) => ({
        handle_delete_backward: { callback: p.handleDeleteBackward.bind(p) },
        handle_delete_range: { callback: p.handleDeleteRange.bind(p) },
        handle_tab: { callback: p.handleTab.bind(p), sequence: 10 },
        handle_shift_tab: { callback: p.handleShiftTab.bind(p), sequence: 10 },
        split_element_block: { callback: p.handleSplitBlock.bind(p) },
        toolbarGroup: {
            id: "list",
            sequence: 30,
            buttons: [
                {
                    id: "bulleted_list",
                    cmd: "TOGGLE_LIST",
                    cmdPayload: { mode: "UL" },
                    icon: "fa-list-ul",
                    name: "Bulleted list",
                    isFormatApplied: isListActive("UL"),
                },
                {
                    id: "numbered_list",
                    cmd: "TOGGLE_LIST",
                    cmdPayload: { mode: "OL" },
                    icon: "fa-list-ol",
                    name: "Numbered list",
                    isFormatApplied: isListActive("OL"),
                },
                {
                    id: "checklist",
                    cmd: "TOGGLE_LIST",
                    cmdPayload: { mode: "CL" },
                    icon: "fa-check-square-o",
                    name: "Checklist",
                    isFormatApplied: isListActive("CL"),
                },
            ],
        },
        powerboxCommands: [
            {
                name: _t("Bulleted list"),
                description: _t("Create a simple bulleted list"),
                category: "structure",
                fontawesome: "fa-list-ul",
                action(dispatch) {
                    dispatch("TOGGLE_LIST", { mode: "UL" });
                },
            },
            {
                name: _t("Numbered list"),
                description: _t("Create a list with numbering"),
                category: "structure",
                fontawesome: "fa-list-ol",
                action(dispatch) {
                    dispatch("TOGGLE_LIST", { mode: "OL" });
                },
            },
            {
                name: _t("Checklist"),
                description: _t("Track tasks with a checklist"),
                category: "structure",

                fontawesome: "fa-check-square-o",
                action(dispatch) {
                    dispatch("TOGGLE_LIST", { mode: "CL" });
                },
            },
        ],
        emptyBlockHints: [
            { selector: "UL LI", hint: _t("List") },
            { selector: "OL LI", hint: _t("List") },
            // @todo @phoenix: hint for checklists was supposed to be "To-do",
            // but never worked because of the ::before pseudo-element is used
            // to display the checkbox.
        ],
    });

    setup() {
        this.addDomListener(this.editable, "touchstart", this.onPointerdown);
        this.addDomListener(this.editable, "mousedown", this.onPointerdown);
    }

    handleCommand(command, payload) {
        switch (command) {
            case "TOGGLE_LIST":
                this.toggleList(payload.mode);
                break;
            case "NORMALIZE": {
                this.normalize(payload.node);
                break;
            }
        }
    }

    // --------------------------------------------------------------------------
    // Commands
    // --------------------------------------------------------------------------

    /**
     * Classifies the selected blocks into three categories:
     * - LI that are part of a list of the same mode as the target one.
     * - Lists (UL or OL) that need to have its mode switched to the target mode.
     * - Blocks that need to be converted to lists.
     *
     *  If (and only if) all blocks fall into the first category, the list items
     *  are converted into paragraphs (result is toggle list OFF).
     *  Otherwise, the LIs in this category remain unchanged and the other two
     *  categories are processed.
     *
     * @param {string} mode - The list mode to toggle (UL, OL, CL).
     * @throws {Error} If an invalid list type is provided.
     */
    toggleList(mode) {
        if (!["UL", "OL", "CL"].includes(mode)) {
            throw new Error(`Invalid list type: ${mode}`);
        }

        // @todo @phoenix: original implementation removed whitespace-only text nodes from traversedNodes.
        // Check if this is necessary.

        // Classify selected blocks.
        const sameModeListItems = new Set();
        const nonListBlocks = new Set();
        const listsToSwitch = new Set();
        for (const block of getTraversedBlocks(this.editable)) {
            if (["OL", "UL"].includes(block.tagName) || !block.isContentEditable) {
                continue;
            }
            const li = block.closest("li");
            if (li) {
                if (getListMode(li.parentElement) === mode) {
                    sameModeListItems.add(li);
                } else {
                    listsToSwitch.add(li.parentElement);
                }
            } else {
                nonListBlocks.add(block);
            }
        }

        // Keep deepest blocks only.
        for (const block of nonListBlocks) {
            if (descendants(block).some((descendant) => nonListBlocks.has(descendant))) {
                nonListBlocks.delete(block);
            }
        }

        // Apply changes.
        if (listsToSwitch.size || nonListBlocks.size) {
            for (const list of listsToSwitch) {
                this.switchListMode(list, mode);
            }
            for (const block of nonListBlocks) {
                this.blockToList(block, mode);
            }
        } else {
            for (const li of sameModeListItems) {
                this.liToP(li);
            }
        }

        this.dispatch("ADD_STEP");
    }

    normalize(root = this.editable) {
        const closestNestedLI = closestElement(root, "li.oe-nested");
        if (closestNestedLI) {
            root = closestNestedLI;
        }
        const selectionToRestore = this.shared.getEditableSelection();
        applyToTree(root, (element) => {
            element = this.mergeSimilarLists(element);
            element = this.unwrapParagraphInLI(element);
            return element;
        });
        const isValid =
            selectionToRestore.anchorNode.isConnected && selectionToRestore.focusNode.isConnected;
        const shouldRestore = selectionToRestore.inEditable && isValid;
        if (shouldRestore) {
            this.shared.setSelection(selectionToRestore, { normalize: false });
        }
    }

    // --------------------------------------------------------------------------
    // Helpers for toggleList
    // --------------------------------------------------------------------------

    /**
     * Switches the list mode of the given list element.
     *
     * @param {HTMLOListElement|HTMLUListElement} list - The list element to switch the mode of.
     * @param {"UL"|"OL"|"CL"} newMode - The new mode to switch to.
     * @returns {HTMLOListElement|HTMLUListElement} The modified list element.
     */
    switchListMode(list, newMode) {
        if (getListMode(list) === newMode) {
            return;
        }
        const newTag = newMode === "CL" ? "UL" : newMode;
        const selectionToRestore = { ...this.shared.getEditableSelection() };
        const newList = setTagName(list, newTag);
        // Clear list style (@todo @phoenix - why??)
        for (const li of newList.children) {
            if (li.style.listStyle !== "none") {
                li.style.listStyle = null;
                if (!li.style.all) {
                    li.removeAttribute("style");
                }
            }
        }
        removeClass(list, "o_checklist");
        if (newMode === "CL") {
            newList.classList.add("o_checklist");
        }
        if (selectionToRestore.anchorNode === list) {
            selectionToRestore.anchorNode = newList;
        }
        if (selectionToRestore.focusNode === list) {
            selectionToRestore.focusNode = newList;
        }
        this.shared.setSelection(selectionToRestore, { normalize: false });
        return newList;
    }

    /**
     * @param {HTMLElement} block element
     * @param {"UL"|"OL"|"CL"} mode
     */
    blockToList(element, mode) {
        if (element.tagName === "P") {
            return this.pToList(element, mode);
        }
        let list;
        const selectionToRestore = { ...this.shared.getEditableSelection() };
        if (element === this.editable) {
            // @todo @phoenix: check if this is needed
            const callingNode = element.firstChild;
            const group = getAdjacents(callingNode, (n) => !isBlock(n));
            list = insertListAfter(this.document, callingNode, mode, [group]);
        } else {
            list = insertListAfter(this.document, element, mode, [element]);
            copyAttributes(element, list);
            if (selectionToRestore.anchorNode === element) {
                selectionToRestore.anchorNode = list.firstElementChild;
            }
            if (selectionToRestore.focusNode === element) {
                selectionToRestore.focusNode = list.firstElementChild;
            }
        }
        this.shared.setSelection(selectionToRestore, { normalize: false });
        return list;
    }

    /**
     * @param {HTMLParagraphElement} p
     * @param {"UL"|"OL"|"CL"} mode
     */
    pToList(p, mode) {
        const selectionToRestore = { ...this.shared.getEditableSelection() };
        const list = insertListAfter(this.document, p, mode, [[...p.childNodes]]);
        this.dispatch("CLEAN_NODE", { node: p });
        copyAttributes(p, list);
        p.remove();

        if (selectionToRestore.anchorNode === p) {
            selectionToRestore.anchorNode = list.firstChild;
        }
        if (selectionToRestore.focusNode === p) {
            selectionToRestore.focusNode = list.firstChild;
        }
        this.shared.setSelection(selectionToRestore, { normalize: false });
        return list;
    }

    /**
     * Transforms a LI into a paragraph.
     *
     * @param {HTMLLIElement} li
     */
    liToP(li) {
        const selectionToRestore = this.shared.getEditableSelection();
        while (li) {
            li = this.outdentLI(li);
        }
        const isValid =
            selectionToRestore.anchorNode.parentElement &&
            selectionToRestore.focusNode.parentElement;
        if (isValid) {
            this.shared.setSelection(selectionToRestore, { normalize: false });
        }
    }

    // --------------------------------------------------------------------------
    // Helpers for normalize
    // --------------------------------------------------------------------------

    mergeSimilarLists(element) {
        if (!element.matches("ul, ol, li.oe-nested")) {
            return element;
        }
        const previousSibling = element.previousElementSibling;
        if (
            previousSibling &&
            element.isContentEditable &&
            previousSibling.isContentEditable &&
            compareListTypes(previousSibling, element)
        ) {
            // @todo @phoenix: what if unremovable/unmergeable?
            element.prepend(...previousSibling.childNodes);
            previousSibling.remove();
        }
        return element;
    }

    unwrapParagraphInLI(element) {
        if (!element.matches("li > p")) {
            return element;
        }
        this.dispatch("CLEAN_NODE", { root: element });
        // Wrap contents is a span if the P has classes.
        // @todo @phoenix: consider always wrapping in a span. Normalize is
        // supposed to unwrap spans that have no attributes anyway.
        if (element.classList.length) {
            return setTagName(element, "span");
        }
        const contents = unwrapContents(element);
        // This assumes an empty P has at least one child (BR).
        return contents[0];
    }

    // --------------------------------------------------------------------------
    // Indentation
    // --------------------------------------------------------------------------

    // @temp comment: former oTab
    /**
     * @param {HTMLLIElement} li
     */
    indentLI(li) {
        const lip = this.document.createElement("li");
        const destul =
            li.previousElementSibling?.querySelector("ol, ul") ||
            li.nextElementSibling?.querySelector("ol, ul") ||
            li.closest("ol, ul");

        const ul = createList(this.document, getListMode(destul));
        lip.append(ul);

        const selectionToRestore = this.shared.getEditableSelection();
        lip.classList.add("oe-nested");
        li.before(lip);
        ul.append(li);
        this.shared.setSelection(selectionToRestore, { normalize: false });
    }

    // @temp comment: former oShiftTab
    // @todo @phoenix: consider refactoring this method. It should return a P of a LI.
    /**
     * @param {HTMLLIElement} li
     * @returns is still in a <LI> nested list
     */
    outdentLI(li) {
        if (li.nextElementSibling) {
            const ul = li.parentElement.cloneNode(false);
            while (li.nextSibling) {
                ul.append(li.nextSibling);
            }
            if (li.parentNode.parentNode.tagName === "LI") {
                const lip = this.document.createElement("li");
                lip.classList.add("oe-nested");
                lip.append(ul);
                li.parentNode.parentNode.after(lip);
            } else {
                li.parentNode.after(ul);
            }
        }

        const selectionToRestore = { ...this.shared.getEditableSelection() };
        if (li.parentNode.parentNode.tagName === "LI") {
            const ul = li.parentNode;
            const shouldRemoveParentLi = !li.previousElementSibling && !ul.previousElementSibling;
            const toremove = shouldRemoveParentLi ? ul.parentNode : null;
            ul.parentNode.after(li);
            let shouldRestore = true;
            if (toremove) {
                if (toremove.classList.contains("oe-nested")) {
                    if (
                        toremove === selectionToRestore.anchorNode ||
                        toremove === selectionToRestore.focusNode
                    ) {
                        shouldRestore = false;
                    }
                    // <li>content<ul>...</ul></li>
                    toremove.remove();
                } else {
                    if (
                        ul === selectionToRestore.anchorNode ||
                        ul === selectionToRestore.focusNode
                    ) {
                        shouldRestore = false;
                    }
                    // <li class="oe-nested"><ul>...</ul></li>
                    ul.remove();
                }
            }
            if (shouldRestore) {
                this.shared.setSelection(selectionToRestore);
            }

            return li;
        } else {
            const ul = li.parentNode;
            const dir = ul.getAttribute("dir");
            let p;
            while (li.firstChild) {
                if (isBlock(li.firstChild)) {
                    if (p && isVisible(p)) {
                        ul.after(p);
                    }
                    p = undefined;
                    ul.after(li.firstChild);
                } else {
                    p = p || this.document.createElement("P");
                    if (dir) {
                        p.setAttribute("dir", dir);
                        p.style.setProperty("text-align", ul.style.getPropertyValue("text-align"));
                    }
                    p.append(li.firstChild);
                }
            }
            if (p && isVisible(p)) {
                ul.after(p);
            }

            if (selectionToRestore.anchorNode === li) {
                selectionToRestore.anchorNode = ul.nextSibling;
            }
            if (selectionToRestore.focusNode === li) {
                selectionToRestore.focusNode = ul.nextSibling;
            }
            this.shared.setSelection(selectionToRestore);
            li.remove();
            if (!ul.firstElementChild) {
                ul.remove();
            }
        }
        return false;
    }

    indentListNodes(listNodes) {
        const selectionToRestore = this.shared.getEditableSelection();
        for (const li of listNodes) {
            this.indentLI(li);
        }
        this.shared.setSelection(selectionToRestore, { normalize: false });
        this.dispatch("ADD_STEP");
    }

    outdentListNodes(listNodes) {
        const selectionToRestore = this.shared.getEditableSelection();
        for (const li of listNodes) {
            this.outdentLI(li);
        }
        this.shared.setSelection(selectionToRestore, { normalize: false });
        this.dispatch("ADD_STEP");
    }

    separateListItems() {
        const listItems = new Set();
        const nonListItems = [];
        for (const block of getTraversedBlocks(this.editable)) {
            const closestLI = block.closest("li");
            if (closestLI) {
                // Keep deepest list items only.
                if (!closestLI.querySelector("li") && closestLI.isContentEditable) {
                    listItems.add(closestLI);
                }
            } else if (!["UL", "OL"].includes(block.tagName)) {
                nonListItems.push(block);
            }
        }
        return { listItems: [...listItems], nonListItems };
    }

    // --------------------------------------------------------------------------
    // Handlers of other plugins commands
    // --------------------------------------------------------------------------

    handleTab() {
        const { listItems, nonListItems } = this.separateListItems();
        if (listItems.length) {
            this.indentListNodes(listItems);
            this.shared.indentBlocks(nonListItems);
            this.dispatch("ADD_STEP");
            return true;
        }
    }

    handleShiftTab() {
        const { listItems, nonListItems } = this.separateListItems();
        if (listItems.length) {
            this.outdentListNodes(listItems);
            this.shared.outdentBlocks(nonListItems);
            this.dispatch("ADD_STEP");
            return true;
        }
    }

    handleSplitBlock(params) {
        const closestLI = closestElement(params.targetNode, "LI");
        if (!closestLI) {
            return;
        }
        if (!closestLI.textContent) {
            this.outdentLI(closestLI);
            return true;
        }
        const newLI = this.shared.splitElementBlock({ ...params, blockToSplit: closestLI });
        if (closestLI.classList.contains("o_checked")) {
            removeClass(newLI, "o_checked");
        }
        return true;
    }

    handleDeleteBackward(range) {
        const { startContainer, endContainer } = range;
        const closestLIendContainer = closestElement(endContainer, "LI");
        if (!closestLIendContainer) {
            return;
        }
        // Detect if cursor is at beginning of LI.
        if (closestElement(startContainer, "LI") !== closestLIendContainer) {
            this.liToP(closestLIendContainer);
            return true;
        }
    }

    // Uncheck checklist item left empty after deleting a multi-LI selection.
    handleDeleteRange(range) {
        const { startContainer, endContainer } = range;
        const startCheckedLi = closestElement(startContainer, "li.o_checked");
        if (!startCheckedLi) {
            return;
        }
        const endLi = closestElement(endContainer, "li");
        if (startCheckedLi === endLi) {
            return;
        }

        const { cursorPos } = this.shared.deleteRange(range);

        if (isEmptyBlock(startCheckedLi)) {
            removeClass(startCheckedLi, "o_checked");
        }

        this.shared.setSelection(cursorPos);
        return true;
    }

    // --------------------------------------------------------------------------
    // Event handlers
    // --------------------------------------------------------------------------

    /**
     * @param {MouseEvent | TouchEvent} ev
     */
    onPointerdown(ev) {
        const node = ev.target;
        const isChecklistItem = node.tagName == "LI" && getListMode(node.parentElement) == "CL";
        if (!isChecklistItem) {
            return;
        }
        let offsetX = ev.offsetX;
        let offsetY = ev.offsetY;
        if (ev.type === "touchstart") {
            const rect = node.getBoundingClientRect();
            offsetX = ev.touches[0].clientX - rect.x;
            offsetY = ev.touches[0].clientY - rect.y;
        }

        if (isChecklistItem && this.isPointerInsideCheckbox(node, offsetX, offsetY)) {
            toggleClass(node, "o_checked");
            ev.preventDefault();
            this.dispatch("ADD_STEP");
        }
    }

    /**
     * @param {MouseEvent} ev
     * @param {HTMLLIElement} li - LI element inside a checklist.
     */
    isPointerInsideCheckbox(li, pointerOffsetX, pointerOffsetY) {
        const beforeStyle = this.document.defaultView.getComputedStyle(li, ":before");
        const checkboxPosition = {
            left: parseInt(beforeStyle.left),
            top: parseInt(beforeStyle.top),
        };
        checkboxPosition.right = checkboxPosition.left + parseInt(beforeStyle.width);
        checkboxPosition.bottom = checkboxPosition.top + parseInt(beforeStyle.height);

        return (
            pointerOffsetX >= checkboxPosition.left &&
            pointerOffsetX <= checkboxPosition.right &&
            pointerOffsetY >= checkboxPosition.top &&
            pointerOffsetY <= checkboxPosition.bottom
        );
    }
}
