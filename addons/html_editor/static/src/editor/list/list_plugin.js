/** @odoo-module */

import { Plugin } from "../plugin";
import { descendants, closestElement, getAdjacents } from "../utils/dom_traversal";
import { isWhitespace, isVisible } from "../utils/dom_info";
import { closestBlock, isBlock } from "../utils/blocks";
import { getListMode, createList, insertListAfter } from "./utils";
import { childNodeIndex } from "../utils/position";
import { preserveCursor, getTraversedNodes } from "../utils/selection";
import { setTagName, copyAttributes, removeClass } from "../utils/dom";

export class ListPlugin extends Plugin {
    static name = "list";

    setup() {
        // @todo Move this to a tab plugin
        this.addDomListener(this.editable, "keydown", this.handleKeyDown);
    }

    // @todo Move this to a tab plugin
    handleKeyDown(event) {
        if (event.key === "Tab") {
            if (event.shiftKey) {
                this.outdentList();
            } else {
                this.indentList();
            }
            event.preventDefault();
            event.stopPropagation();
        }
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
        this.dispatch("SANITIZE");
    }

    // @todo Naive implementation. Known issues:
    // - merges a checklist into a unordered list
    // - fails to merge list with pre-existing previous siblings
    mergeLists() {
        const restoreCursor = preserveCursor(this.document);
        const range = this.document.getSelection().getRangeAt(0);
        const list = closestElement(range.startContainer, "ul, ol");
        while (list && list.nextElementSibling?.tagName === list.tagName) {
            list.append(...list.nextElementSibling.childNodes);
            list.nextElementSibling.remove();
        }
        restoreCursor();
    }

    // @todo Handle tab on nonList items (interaction with a tab plugin?)
    getTraversedListNodes() {
        // Split traversed nodes into list items and the rest.
        const listItems = new Set();
        const nonListItems = new Set();
        for (const node of getTraversedNodes(this.editable)) {
            const closestLi = closestElement(node, "li");
            const target = closestLi || node;
            if (!target.querySelector?.("li")) {
                if (closestLi) {
                    listItems.add(closestLi);
                } else {
                    nonListItems.add(node);
                }
            }
        }
        return listItems;
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
        const restoreCursor = preserveCursor(this.document);
        this.getTraversedListNodes().forEach((li) => this.indentLI(li));
        restoreCursor();
    }

    outdentList() {
        const restoreCursor = preserveCursor(this.document);
        this.getTraversedListNodes().forEach((li) => this.outdentLI(li));
        restoreCursor();
    }

    // @temp comment: former oTab
    // @todo: handle call with nodes that are children of a LI element (see oTab methods)
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
}
