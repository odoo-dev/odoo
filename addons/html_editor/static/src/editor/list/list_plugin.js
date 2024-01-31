/** @odoo-module */

import { Plugin } from "../plugin";
import { descendants, closestElement, getAdjacents } from "../utils/dom_traversal";
import { isWhitespace, isVisible } from "../utils/dom_info";
import { closestBlock, isBlock } from "../utils/blocks";
import { getListMode, createList, insertListAfter, mergeSimilarLists, applyToTree } from "./utils";
import { childNodeIndex } from "../utils/position";
import { preserveCursor, getTraversedNodes, getTraversedBlocks } from "../utils/selection";
import { setTagName, copyAttributes, removeClass, toggleClass } from "../utils/dom";
import { registry } from "@web/core/registry";

export class ListPlugin extends Plugin {
    static name = "list";
    static dependencies = ["tabulation"];

    setup() {
        this.registry
            .category("delete_element_backward_before")
            .add("list", this.deleteElementBackwardBefore.bind(this));
        this.registry
            .category("delete_element_forward_before")
            .add("list", this.deleteElementForwardBefore.bind(this));
        this.registry
            .category("handle_tab")
            .add("list", this.handleTab.bind(this), { sequence: 10 });
        this.registry
            .category("handle_shift_tab")
            .add("list", this.handleShiftTab.bind(this), { sequence: 10 });
        // @todo @phoenix check this is still needed for checklist
        // this.registry
        //     .category("split_element_block_before")
        //     .add("list", this.splitElementBlockBefore.bind(this));

        this.addDomListener(this.editable, "mousedown", this.onMousedown);
    }

    handleCommand(command, payload) {
        switch (command) {
            // @todo
            // Change toolbar in order to support commands with parameters
            case "TOGGLE_LIST_UL":
                this.toggleList("UL");
                break;
            case "TOGGLE_LIST_OL":
                this.toggleList("OL");
                break;
            case "TOGGLE_CHECKLIST":
                this.toggleList("CL");
                break;
            // @todo
            // Powerbox commands for lists on a empty paragraph do not work because
            // the BR is not properly restored after the "/command" is removed (see applyCommand powerbox.js).
            case "TOGGLE_LIST":
                this.toggleList(payload.type);
                break;
            case "INDENT_LIST":
                this.indentList();
                break;
            case "OUTDENT_LIST":
                this.outdentList();
                break;
            case "SANITIZE":
                this.mergeLists();
                break;
        }
    }

    handleTab() {
        const { listItems, nonListItems } = this.separateListItems();
        if (listItems.length) {
            this.indentListNodes(listItems);
            this.shared.indentBlocks(nonListItems);
            return true;
        }
    }

    handleShiftTab() {
        const { listItems, nonListItems } = this.separateListItems();
        if (listItems.length) {
            this.outdentListNodes(listItems);
            this.shared.outdentBlocks(nonListItems);
            return true;
        }
    }

    separateListItems() {
        const listItems = [];
        const nonListItems = [];
        for (const block of getTraversedBlocks(this.editable)) {
            // Keep deepest list items only.
            if (block.tagName === "LI" && !block.querySelector("li")) {
                listItems.push(block);
            } else if (!["UL", "OL"].includes(block.tagName)) {
                nonListItems.push(block);
            }
        }
        return { listItems, nonListItems };
    }

    toggleList(mode) {
        if (!["UL", "OL", "CL"].includes(mode)) {
            throw new Error(`Invalid list type: ${mode}`);
        }
        const li = new Set();
        const blocks = new Set();

        const selectedNodes = getTraversedNodes(this.editable);
        const deepestSelectedNodes = selectedNodes.filter(
            (node) => !descendants(node).some((descendant) => selectedNodes.includes(descendant))
        );
        for (const node of deepestSelectedNodes) {
            if (
                node.nodeType === Node.TEXT_NODE &&
                isWhitespace(node) &&
                closestElement(node).isContentEditable
            ) {
                node.remove();
            } else {
                let block = closestBlock(node);
                if (!["OL", "UL"].includes(block.tagName) && block.isContentEditable) {
                    block = block.closest("li") || block;
                    const ublock = block.closest("ol, ul");
                    ublock && getListMode(ublock) == mode ? li.add(block) : blocks.add(block);
                }
            }
        }

        let target = [...(blocks.size ? blocks : li)];
        while (target.length) {
            const node = target.pop();
            // only apply one li per ul
            if (!this.toggleListNode(node, 0, mode)) {
                target = target.filter(
                    (li) => li.parentNode != node.parentNode || li.tagName != "LI"
                );
            }
        }
        // @todo @phoenix NBY: use history step instead
        this.dispatch("SANITIZE");
    }

    mergeLists(root = this.editable) {
        const restoreCursor = preserveCursor(this.document);
        applyToTree(root, mergeSimilarLists);
        restoreCursor();
    }

    /**
     * @param {Node} node
     * @param {number} offset
     * @param {'UL'|'OL'|'CL'} mode
     * @returns {any} - @todo find this out || make it something logical
     */
    toggleListNode(node, offset, mode) {
        if (node.nodeType === Node.TEXT_NODE) {
            return this.toggleListNode(node.parentElement, childNodeIndex(node), mode);
        }
        if (node.tagName === "LI") {
            return this.toggleListLI(node, mode);
        }
        if (node.tagName === "P") {
            return this.toggleListP(node, mode);
        }
        return this.toggleListHTMLElement(node, offset, mode);
    }

    /**
     * @param {HTMLLIElement} liElement
     * @param {"UL"|"OL"|"CL"} mode
     */
    toggleListLI(liElement, mode) {
        const pnode = liElement.closest("ul, ol");
        if (!pnode) {
            return;
        }
        const restoreCursor = preserveCursor(this.document);
        const listMode = getListMode(pnode) + mode;
        if (["OLCL", "ULCL"].includes(listMode)) {
            pnode.classList.add("o_checklist");
            for (let li = pnode.firstElementChild; li !== null; li = li.nextElementSibling) {
                if (li.style.listStyle != "none") {
                    li.style.listStyle = null;
                    if (!li.style.all) {
                        li.removeAttribute("style");
                    }
                }
            }
            setTagName(pnode, "UL");
        } else if (["CLOL", "CLUL"].includes(listMode)) {
            removeClass(pnode, "o_checklist");
            setTagName(pnode, mode);
        } else if (["OLUL", "ULOL"].includes(listMode)) {
            setTagName(pnode, mode);
        } else {
            // toggle => remove list
            let node = liElement;
            while (node) {
                node = this.outdentLI(node);
            }
        }

        restoreCursor();
        return false;
    }

    /**
     * @param {HTMLParagraphElement} p
     * @param {"UL"|"OL"|"CL"} mode
     */
    toggleListP(p, mode = "UL") {
        const restoreCursor = preserveCursor(this.document);
        const list = insertListAfter(p, mode, [[...p.childNodes]]);
        copyAttributes(p, list);
        p.remove();

        restoreCursor(new Map([[p, list.firstChild]]));
        return true;
    }

    /**
     * @param {HTMLElement} element
     * @param {number} offset
     * @param {"UL"|"OL"|"CL"} mode
     */
    toggleListHTMLElement(element, offset, mode = "UL") {
        if (!isBlock(element)) {
            return this.toggleListNode(element.parentElement, childNodeIndex(element));
        }
        const inLI = element.closest("li");
        if (inLI) {
            return this.toggleListNode(inLI, 0, mode);
        }
        const restoreCursor = preserveCursor(this.document);
        if (element.classList.contains("odoo-editor-editable")) {
            const callingNode = element.childNodes[offset];
            const group = getAdjacents(callingNode, (n) => !isBlock(n));
            insertListAfter(callingNode, mode, [group]);
            restoreCursor();
        } else {
            const list = insertListAfter(element, mode, [element]);
            copyAttributes(element, list);
            restoreCursor(new Map([[element, list.firstElementChild]]));
        }
    }

    indentList() {
        const { listItems } = this.separateListItems();
        this.indentListNodes(listItems);
    }

    outdentList() {
        const { listItems } = this.separateListItems();
        this.outdentListNodes(listItems);
    }

    indentListNodes(listNodes) {
        const restoreCursor = preserveCursor(this.document);
        for (const li of listNodes) {
            this.indentLI(li);
        }
        restoreCursor();
        // @todo @phoenix NBY: use history step instead
        this.dispatch("SANITIZE");
    }

    outdentListNodes(listNodes) {
        const restoreCursor = preserveCursor(this.document);
        for (const li of listNodes) {
            this.outdentLI(li);
        }
        restoreCursor();
        // @todo @phoenix NBY: use history step instead
        this.dispatch("SANITIZE");
    }

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
        return true;
    }

    // @temp comment: former oShiftTab
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

    deleteElementBackwardBefore({ targetNode, targetOffset, outdentList = true, fromForward }) {
        if (!fromForward && outdentList && targetNode.tagName === "LI" && targetOffset === 0) {
            this.dispatch("LIST_OUTDENT", { element: targetNode, index: 0 });
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

    splitElementBlockBefore(params) {
        const { targetNode, skipList } = params;
        if (targetNode.tagName === "LI" && !skipList) {
            // If not empty list item, regular block split
            if (targetNode.textContent) {
                const node = this.shared.splitElementBlock({ ...params, skipList: true });
                if (node.classList.contains("o_checked")) {
                    removeClass(node, "o_checked");
                }
            } else {
                this.outdentList();
            }
            return true;
        }
    }

    onMousedown(ev) {
        const node = ev.target;
        const isChecklistItem = node.tagName == "LI" && getListMode(node.parentElement) == "CL";
        if (isChecklistItem && this.isPointerInsideCheckbox(node, ev.offsetX, ev.offsetY)) {
            toggleClass(node, "o_checked");
            ev.preventDefault();
            // @todo: historyStep
            this.dispatch("SANITIZE");
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
