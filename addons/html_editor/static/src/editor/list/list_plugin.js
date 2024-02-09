import { Plugin } from "../plugin";
import { closestElement, getAdjacents } from "../utils/dom_traversal";
import { isShrunkBlock, isVisible } from "../utils/dom_info";
import { closestBlock, isBlock } from "../utils/blocks";
import { getListMode, createList, insertListAfter, mergeSimilarLists, applyToTree } from "./utils";
import { preserveCursor, getTraversedBlocks } from "../utils/selection";
import { setTagName, copyAttributes, removeClass, toggleClass } from "../utils/dom";
import { registry } from "@web/core/registry";

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
    static dependencies = ["tabulation", "split_block"];
    static resources = (p) => ({
        delete_element_backward_before: { callback: p.deleteElementBackwardBefore.bind(p) },
        delete_element_forward_before: { callback: p.deleteElementForwardBefore.bind(p) },
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
    });

    setup() {
        this.addDomListener(this.editable, "mousedown", this.onMousedown);
    }

    handleCommand(command, payload) {
        switch (command) {
            case "TOGGLE_LIST":
                this.toggleList(payload.mode);
                break;
            case "NORMALIZE": {
                const root = payload;
                this.mergeLists(root);
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

    mergeLists(root = this.editable) {
        const closestNestedLI = closestElement(root, "li.oe-nested");
        if (closestNestedLI) {
            root = closestNestedLI;
        }
        applyToTree(root, mergeSimilarLists);
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
        const restoreCursor = preserveCursor(this.document);
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
        restoreCursor(new Map([[list, newList]]));
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
        const restoreCursor = preserveCursor(this.document);
        if (element === this.editable) {
            // @todo @phoenix: check if this is needed
            const callingNode = element.firstChild;
            const group = getAdjacents(callingNode, (n) => !isBlock(n));
            list = insertListAfter(callingNode, mode, [group]);
            restoreCursor();
        } else {
            list = insertListAfter(element, mode, [element]);
            copyAttributes(element, list);
            restoreCursor(new Map([[element, list.firstElementChild]]));
        }
        return list;
    }

    /**
     * @param {HTMLParagraphElement} p
     * @param {"UL"|"OL"|"CL"} mode
     */
    pToList(p, mode) {
        // @todo
        // Powerbox commands for lists on a empty paragraph do not work because
        // the BR is not properly restored after the "/command" is removed (see applyCommand powerbox.js),
        // and the remaining empty text node is removed. This is a temp fix.
        if (isShrunkBlock(p)) {
            p.append(this.document.createElement("BR"));
        }

        const restoreCursor = preserveCursor(this.document);
        const list = insertListAfter(p, mode, [[...p.childNodes]]);
        copyAttributes(p, list);
        p.remove();

        restoreCursor(new Map([[p, list.firstChild]]));
        return list;
    }

    /**
     * Transforms a LI into a paragraph.
     *
     * @param {HTMLLIElement} li
     */
    liToP(li) {
        const restoreCursor = preserveCursor(this.document);
        while (li) {
            li = this.outdentLI(li);
        }
        restoreCursor();
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

        const ul = createList(getListMode(destul));
        lip.append(ul);

        const restoreCursor = preserveCursor(this.document);
        lip.classList.add("oe-nested");
        li.before(lip);
        ul.append(li);
        restoreCursor();
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

        const restoreCursor = preserveCursor(this.document);
        if (li.parentNode.parentNode.tagName === "LI") {
            const ul = li.parentNode;
            const shouldRemoveParentLi = !li.previousElementSibling && !ul.previousElementSibling;
            const toremove = shouldRemoveParentLi ? ul.parentNode : null;
            ul.parentNode.after(li);
            if (toremove) {
                if (toremove.classList.contains("oe-nested")) {
                    // <li>content<ul>...</ul></li>
                    toremove.remove();
                } else {
                    // <li class="oe-nested"><ul>...</ul></li>
                    ul.remove();
                }
            }
            restoreCursor();
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

            restoreCursor(new Map([[li, ul.nextSibling]]));
            li.remove();
            if (!ul.firstElementChild) {
                ul.remove();
            }
        }
        return false;
    }

    indentListNodes(listNodes) {
        const restoreCursor = preserveCursor(this.document);
        for (const li of listNodes) {
            this.indentLI(li);
        }
        restoreCursor();
        this.dispatch("ADD_STEP");
    }

    outdentListNodes(listNodes) {
        const restoreCursor = preserveCursor(this.document);
        for (const li of listNodes) {
            this.outdentLI(li);
        }
        restoreCursor();
        this.dispatch("ADD_STEP");
    }

    separateListItems() {
        const listItems = [];
        const nonListItems = [];
        for (const block of getTraversedBlocks(this.editable)) {
            const closestLI = block.closest("li");
            if (closestLI) {
                // Keep deepest list items only.
                if (!closestLI.querySelector("li")) {
                    listItems.push(closestLI);
                }
            } else if (!["UL", "OL"].includes(block.tagName)) {
                nonListItems.push(block);
            }
        }
        return { listItems, nonListItems };
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
        if (closestLI.classList.contains("o_checked")) {
            const newLI = this.shared.splitElementBlock(params);
            removeClass(newLI, "o_checked");
            return true;
        }
    }

    deleteElementBackwardBefore({ targetNode, targetOffset, outdentList = true, fromForward }) {
        if (!fromForward && outdentList && targetNode.tagName === "LI" && targetOffset === 0) {
            this.liToP(targetNode);
            return true;
        }
    }

    deleteElementForwardBefore({ targetNode, targetOffset }) {
        const parentElement = targetNode.parentElement;
        const nextSibling = targetNode.nextSibling;
        if (
            parentElement &&
            nextSibling &&
            ["LI", "UL", "OL"].includes(nextSibling.tagName) &&
            (targetOffset === targetNode.childNodes.length ||
                (targetNode.childNodes.length === 1 && targetNode.childNodes[0].tagName === "BR"))
        ) {
            const nextSiblingNestedLi = nextSibling.querySelector("li:first-child");
            if (nextSiblingNestedLi) {
                // Add the first LI from the next sibbling list to the current list.
                targetNode.after(nextSiblingNestedLi);
                // Remove the next sibbling list if it's empty.
                if (!isVisible(nextSibling, false) || nextSibling.textContent === "") {
                    nextSibling.remove();
                }
                this.dispatch("DELETE_ELEMENT_BACKWARD", {
                    targetNode: nextSiblingNestedLi,
                    targetOffset: 0,
                    alreadyMoved: true,
                    outdentList: false,
                });
            } else {
                this.dispatch("DELETE_ELEMENT_BACKWARD", {
                    targetNode: nextSibling,
                    targetOffset: 0,
                    outdentList: false,
                });
            }
            return true;
        }
    }

    // --------------------------------------------------------------------------
    // Event handlers
    // --------------------------------------------------------------------------

    onMousedown(ev) {
        const node = ev.target;
        const isChecklistItem = node.tagName == "LI" && getListMode(node.parentElement) == "CL";
        if (isChecklistItem && this.isPointerInsideCheckbox(node, ev.offsetX, ev.offsetY)) {
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

registry.category("phoenix_plugins").add(ListPlugin.name, ListPlugin);
