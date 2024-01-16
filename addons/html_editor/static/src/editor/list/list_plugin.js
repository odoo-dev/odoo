/** @odoo-module */

import { Plugin } from "../plugin";
import { descendants, closestElement, getAdjacents } from "../utils/dom_traversal";
import { isWhitespace } from "../utils/dom_info";
import { closestBlock, isBlock } from "../utils/blocks";
import { getListMode, insertListAfter } from "./utils";
import { childNodeIndex } from "../utils/position";
import { preserveCursor, getTraversedNodes } from "../utils/selection";
import { setTagName, toggleClass } from "../utils/dom";

export class ListPlugin extends Plugin {
    static name = "list";

    handleCommand(command, payload) {
        switch (command) {
            case "TOGGLE_LIST_UL":
                this.toggleList("UL");
                break;
            case "TOGGLE_LIST_OL":
                this.toggleList("OL");
                break;
            case "TOGGLE_CHECKLIST":
                this.toggleList("CL");
                break;
            // @todo: This supports the powerbox as of now.
            // Choose one of the two solutions (single command + parameter vs multiple commands).
            // Powerbox commands for lists on a empty paragraph do not work because
            // the BR is not properly restored after the "/command" is removed (see applyCommand powerbox.js).
            case "TOGGLE_LIST":
                this.toggleList(payload.type);
                break;
        }
    }

    toggleList(mode) {
        if (!["UL", "OL", "CL"].includes(mode)) {
            throw new Error(`Invalid list type: ${mode}`);
        }
        const li = new Set();
        const blocks = new Set();

        const selectedBlocks = getTraversedNodes(this.editable);
        const deepestSelectedBlocks = selectedBlocks.filter(
            (block) => !descendants(block).some((descendant) => selectedBlocks.includes(descendant))
        );
        for (const node of deepestSelectedBlocks) {
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
            if (!oToggleList(node, 0, mode)) {
                target = target.filter(
                    (li) => li.parentNode != node.parentNode || li.tagName != "LI"
                );
            }
        }
    }
}

// @todo: This dispatcher replaces the methods added to Node prototype.
// A second pass is should get rid of the use "this" and use a "node" argument instead.
function oToggleList(node, offset, mode) {
    const toggleListFunctions = {
        "#text": TextoToggleList,
        LI: HTMLLIElementoToggleList,
        P: HTMLParagraphElementoToggleList,
    };
    const toggleListFunction = toggleListFunctions[node.nodeName] || HTMLElementoToggleList;
    return toggleListFunction.call(node, offset, mode);
}

function TextoToggleList(offset, mode) {
    oToggleList(this.parentElement, childNodeIndex(this), mode);
}

function HTMLLIElementoToggleList(offset, mode) {
    const pnode = this.closest("ul, ol");
    if (!pnode) {
        return;
    }
    const restoreCursor = preserveCursor(this.ownerDocument);
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
        toggleClass(pnode, "o_checklist");
        setTagName(pnode, mode);
    } else if (["OLUL", "ULOL"].includes(listMode)) {
        setTagName(pnode, mode);
    // } else {
    //     // toggle => remove list
    //     let node = this;
    //     while (node) {
    //         node = node.oShiftTab(offset); // <- TODO
    //     }
    }

    restoreCursor();
    return false;
}

function HTMLParagraphElementoToggleList(offset, mode = "UL") {
    const restoreCursor = preserveCursor(this.ownerDocument);
    const list = insertListAfter(this, mode, [[...this.childNodes]]);
    const classList = [...list.classList];
    for (const attribute of this.attributes) {
        if (attribute.name === "class" && attribute.value && list.className) {
            list.className = `${list.className} ${attribute.value}`;
        } else {
            list.setAttribute(attribute.name, attribute.value);
        }
    }
    for (const className of classList) {
        list.classList.toggle(className, true); // restore list classes
    }
    this.remove();

    restoreCursor(new Map([[this, list.firstChild]]));
    return true;
}

function HTMLElementoToggleList(offset, mode = "UL") {
    if (!isBlock(this)) {
        return oToggleList(this.parentElement, childNodeIndex(this));
    }
    const inLI = this.closest("li");
    if (inLI) {
        return oToggleList(inLI, 0, mode);
    }
    const restoreCursor = preserveCursor(this.ownerDocument);
    if (this.oid === "root") {
        const callingNode = this.childNodes[offset];
        const group = getAdjacents(callingNode, (n) => !isBlock(n));
        insertListAfter(callingNode, mode, [group]);
        restoreCursor();
    } else {
        const list = insertListAfter(this, mode, [this]);
        for (const attribute of this.attributes) {
            if (attribute.name === "class" && attribute.value && list.className) {
                list.className = `${list.className} ${attribute.value}`;
            } else {
                list.setAttribute(attribute.name, attribute.value);
            }
        }
        restoreCursor(new Map([[this, list.firstElementChild]]));
    }
}
