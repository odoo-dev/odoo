import { Plugin } from "@html_editor/plugin";
import { closestElement } from "@html_editor/utils/dom_traversal";
import { QWebPicker } from "./qweb_picker";

export class QWebPlugin extends Plugin {
    static name = "qweb";
    static dependencies = ["overlay", "selection"];
    static resources = (p) => ({
        onSelectionChange: p.onSelectionChange.bind(p),
    });

    setup() {
        this.picker = this.shared.createOverlay(QWebPicker, {
            getGroups: () => this.getNodeGroups(this.selectedNode),
            select: this.select.bind(this),
        });
        this.addDomListener(this.editable, "click", this.onClick);
        this.groupIndex = 0;
    }

    handleCommand(command, payload) {
        switch (command) {
            case "NORMALIZE":
                this.normalize(payload.node);
                break;
            case "CLEAN":
                for (const node of this.editable.querySelectorAll(
                    "[data-oe-t-group], [data-oe-t-inline], [data-oe-t-selectable], [data-oe-t-group-active]"
                )) {
                    node.removeAttribute("data-oe-t-group-active");
                    node.removeAttribute("data-oe-t-group");
                    node.removeAttribute("data-oe-t-inline");
                    node.removeAttribute("data-oe-t-selectable");
                }
                for (const element of this.editable.querySelectorAll(
                    "[t-esc], [t-raw], [t-out], [t-field]"
                )) {
                    element.setAttribute("contenteditable", "false");
                }
                break;
        }
    }

    onSelectionChange(selection) {
        const qwebNode =
            selection.anchorNode &&
            closestElement(selection.anchorNode, "[t-field],[t-esc],[t-out]");
        if (qwebNode) {
            // select the whole qweb node
            this.shared.setSelection(selection, { normalize: false });
        }
    }

    normalize(root) {
        this.normalizeInline(root);

        for (const element of root.querySelectorAll("[t-esc], [t-raw], [t-out], [t-field]")) {
            element.setAttribute("contenteditable", "false");
        }
        this.applyGroupQwebBranching(root);
    }

    checkAllInline(el) {
        return [...el.children].every((child) => {
            if (child.tagName === "T") {
                return this.checkAllInline(child);
            } else {
                return (
                    child.nodeType !== Node.ELEMENT_NODE ||
                    this.document.defaultView.getComputedStyle(child).display === "inline"
                );
            }
        });
    }

    normalizeInline(root) {
        for (const el of root.querySelectorAll("t")) {
            if (this.checkAllInline(el)) {
                el.setAttribute("data-oe-t-inline", "true");
            }
        }
    }

    getNodeGroups(node) {
        const branchNode = node.closest("[data-oe-t-group]");
        if (!branchNode) {
            return [];
        }
        const groupId = branchNode.getAttribute("data-oe-t-group");
        const group = [];
        for (const node of branchNode.parentElement.querySelectorAll(
            `[data-oe-t-group='${groupId}']`
        )) {
            let label = "";
            if (node.hasAttribute("t-if")) {
                label = `if: ${node.getAttribute("t-if")}`;
            } else if (node.hasAttribute("t-elif")) {
                label = `elif: ${node.getAttribute("t-elif")}`;
            } else if (node.hasAttribute("t-else")) {
                label = "else";
            }
            group.push({
                groupId,
                node,
                label,
                isActive: node.getAttribute("data-oe-t-group-active") === "true",
            });
        }
        return [...this.getNodeGroups(branchNode.parentElement), group];
    }

    onClick(ev) {
        this.picker.close();
        const targetNode = ev.target;
        if (targetNode.closest("[data-oe-t-group]")) {
            this.selectedNode = targetNode;
            this.picker.open(this.selectedNode);
        }
    }

    applyGroupQwebBranching(root) {
        const tNodes = root.querySelectorAll("[t-if], [t-elif], [t-else]");
        const groupsEncounter = new Set();
        for (const node of tNodes) {
            const prevNode = node.previousElementSibling;

            let groupId;
            if (prevNode && !node.hasAttribute("t-if")) {
                // Make the first t-if selectable, if prevNode is not a t-if,
                // it's already data-oe-t-selectable.
                prevNode.setAttribute("data-oe-t-selectable", "true");
                groupId = parseInt(prevNode.getAttribute("data-oe-t-group"));
                node.setAttribute("data-oe-t-selectable", "true");
            } else {
                groupId = this.groupIndex++;
            }
            groupsEncounter.add(groupId);
            node.setAttribute("data-oe-t-group", groupId);
        }
        for (const groupId of groupsEncounter) {
            const isOneElementActive = root.querySelector(
                `[data-oe-t-group='${groupId}'][data-oe-t-group-active]`
            );
            // If there is no element in groupId activated, activate the first
            // one.
            if (!isOneElementActive) {
                root.querySelector(`[data-oe-t-group='${groupId}']`).setAttribute(
                    "data-oe-t-group-active",
                    "true"
                );
            }
        }
    }

    select(node) {
        const groupId = node.getAttribute("data-oe-t-group");
        const activeElement = node.parentElement.querySelector(
            `[data-oe-t-group='${groupId}'][data-oe-t-group-active]`
        );
        if (activeElement === node) {
            return;
        }
        activeElement.removeAttribute("data-oe-t-group-active");
        node.setAttribute("data-oe-t-group-active", "true");
        if (this.selectedNode.getAttribute("data-oe-t-group") !== groupId) {
            this.selectedNode = node;
            this.picker.close();
            this.picker.open(node);
        }
    }
}
