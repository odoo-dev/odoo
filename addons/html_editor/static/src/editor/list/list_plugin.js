/** @odoo-module */

import { Plugin } from "../plugin";
import { descendants, closestElement, getAdjacents } from "../utils/dom_traversal";
import { isWhitespace, isVisible } from "../utils/dom_info";
import { closestBlock, isBlock } from "../utils/blocks";
import { getListMode, insertListAfter } from "./utils";
import { childNodeIndex } from "../utils/position";
import { preserveCursor, getTraversedNodes } from "../utils/selection";
import { setTagName, toggleClass } from "../utils/dom";

export class ListPlugin extends Plugin {
    static name = "list";

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
            if (!toggleList(node, 0, mode)) {
                target = target.filter(
                    (li) => li.parentNode != node.parentNode || li.tagName != "LI"
                );
            }
        }
    }
}

function toggleList(node, offset, mode) {
    if (node.tagName === "#text") {
        return toggleList(node.parentElement, childNodeIndex(node), mode);
    }
    if (node.tagName === "LI") {
        return toggleListLI(node, mode);
    }
    if (node.tagName === "P") {
        return toggleListP(node, mode);
    }
    return toggleListHTMLElement(node, offset, mode);
}

function toggleListLI(liElement, mode) {
    const pnode = liElement.closest("ul, ol");
    if (!pnode) {
        return;
    }
    const restoreCursor = preserveCursor(liElement.ownerDocument);
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
    } else {
        // toggle => remove list
        let node = liElement;
        while (node) {
            node = shiftTab(node);
        }
    }

    restoreCursor();
    return false;
}

function toggleListP(element, mode = "UL") {
    const restoreCursor = preserveCursor(element.ownerDocument);
    const list = insertListAfter(element, mode, [[...element.childNodes]]);
    const classList = [...list.classList];
    for (const attribute of element.attributes) {
        if (attribute.name === "class" && attribute.value && list.className) {
            list.className = `${list.className} ${attribute.value}`;
        } else {
            list.setAttribute(attribute.name, attribute.value);
        }
    }
    for (const className of classList) {
        list.classList.toggle(className, true); // restore list classes
    }
    element.remove();

    restoreCursor(new Map([[element, list.firstChild]]));
    return true;
}

function toggleListHTMLElement(element, offset, mode = "UL") {
    if (!isBlock(element)) {
        return toggleList(element.parentElement, childNodeIndex(element));
    }
    const inLI = element.closest("li");
    if (inLI) {
        return toggleList(inLI, 0, mode);
    }
    const restoreCursor = preserveCursor(element.ownerDocument);
    if (element.classList.contains("odoo-editor-editable")) {
        const callingNode = element.childNodes[offset];
        const group = getAdjacents(callingNode, (n) => !isBlock(n));
        insertListAfter(callingNode, mode, [group]);
        restoreCursor();
    } else {
        const list = insertListAfter(element, mode, [element]);
        for (const attribute of element.attributes) {
            if (attribute.name === "class" && attribute.value && list.className) {
                list.className = `${list.className} ${attribute.value}`;
            } else {
                list.setAttribute(attribute.name, attribute.value);
            }
        }
        restoreCursor(new Map([[element, list.firstElementChild]]));
    }
}

// returns: is still in a <LI> nested list
function shiftTab(liElement) {
    if (liElement.nextElementSibling) {
        const ul = liElement.parentElement.cloneNode(false);
        while (liElement.nextSibling) {
            ul.append(liElement.nextSibling);
        }
        if (liElement.parentNode.parentNode.tagName === "LI") {
            const lip = document.createElement("li");
            toggleClass(lip, "oe-nested");
            lip.append(ul);
            liElement.parentNode.parentNode.after(lip);
        } else {
            liElement.parentNode.after(ul);
        }
    }

    const restoreCursor = preserveCursor(liElement.ownerDocument);
    if (liElement.parentNode.parentNode.tagName === "LI") {
        const ul = liElement.parentNode;
        const shouldRemoveParentLi =
            !liElement.previousElementSibling && !ul.previousElementSibling;
        const toremove = shouldRemoveParentLi ? ul.parentNode : null;
        ul.parentNode.after(liElement);
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
        return liElement;
    } else {
        const ul = liElement.parentNode;
        const dir = ul.getAttribute("dir");
        let p;
        while (liElement.firstChild) {
            if (isBlock(liElement.firstChild)) {
                if (p && isVisible(p)) {
                    ul.after(p);
                }
                p = undefined;
                ul.after(liElement.firstChild);
            } else {
                p = p || document.createElement("P");
                if (dir) {
                    p.setAttribute("dir", dir);
                    p.style.setProperty("text-align", ul.style.getPropertyValue("text-align"));
                }
                p.append(liElement.firstChild);
            }
        }
        if (p && isVisible(p)) {
            ul.after(p);
        }

        restoreCursor(new Map([[liElement, ul.nextSibling]]));
        liElement.remove();
        if (!ul.firstElementChild) {
            ul.remove();
        }
    }
    return false;
}
