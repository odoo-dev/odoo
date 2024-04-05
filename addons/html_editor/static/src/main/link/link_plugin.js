import { _t } from "@web/core/l10n/translation";
import { Plugin } from "@html_editor/plugin";
import { getDeepRange, findInSelection, getSelectedNodes } from "@html_editor/utils/selection";
import { closestElement } from "@html_editor/utils/dom_traversal";
import { LinkPopover } from "./link_popover";
import { reactive } from "@odoo/owl";
import { unwrapContents } from "@html_editor/utils/dom";

function isLinkActive(editable) {
    const linkElementAnchor = closestElement(editable.ownerDocument.getSelection().anchorNode, "A");
    const linkElementFocus = closestElement(editable.ownerDocument.getSelection().focusNode, "A");
    if (linkElementFocus && linkElementAnchor) {
        return linkElementAnchor === linkElementFocus;
    }
    if (linkElementAnchor || linkElementFocus) {
        return true;
    }
    const selectedNodes = getSelectedNodes(editable);
    if (selectedNodes.length === 1) {
        return closestElement(selectedNodes[0], "A") !== null;
    }

    return false;
}

export class LinkPlugin extends Plugin {
    static name = "link";
    static dependencies = ["dom", "selection", "overlay"];
    // @phoenix @todo: do we want to have createLink and insertLink methods in link plugin?
    static shared = ["createLink", "insertLink", "getPathAsUrlCommand"];
    /** @type { (p: LinkPlugin) => Record<string, any> } */
    static resources = (p) => ({
        toolbarGroup: {
            id: "link",
            sequence: 40,
            buttons: [
                {
                    id: "link",
                    cmd: "CREATE_LINK_ON_SELECTION",
                    cmdPayload: { options: {} },
                    icon: "fa-link",
                    name: "link",
                    label: _t("Link"),
                    isFormatApplied: isLinkActive,
                },
            ],
        },
        powerboxCategory: { id: "navigation", name: _t("Navigation"), sequence: 40 },
        powerboxCommands: [
            {
                name: _t("Link"),
                description: _t("Add a link"),
                category: "navigation",
                fontawesome: "fa-link",
                action(dispatch) {
                    dispatch("TOGGLE_LINK", { options: {} });
                },
            },
            {
                name: _t("Button"),
                description: _t("Add a button"),
                category: "navigation",
                fontawesome: "fa-link",
                action(dispatch) {
                    dispatch("TOGGLE_LINK", { options: {} });
                },
            },
        ],
        onSelectionChange: p.handleSelectionChange.bind(p),
    });
    setup() {
        this.linkState = reactive({ linkElement: null });
        this.overlay = this.shared.createOverlay(LinkPopover, { position: "bottom-start" });
        this.addDomListener(this.editable, "click", (ev) => {
            if (ev.target.tagName === "A") {
                ev.preventDefault();
                this.toggleLinkTools({});
            }
        });
    }

    handleCommand(command, payload) {
        switch (command) {
            case "CREATE_LINK_ON_SELECTION":
                this.toggleLinkTools(payload.options);
                break;

            case "TOGGLE_LINK":
                this.toggleLinkTools(payload.options);
                break;
            case "NORMALIZE": {
                this.normalizeLink(payload.node);
                break;
            }
            case "REMOVE_LINK":
                this.removeLink(payload.node);
                break;
            case "RESTORE_SELECTION":
                this.restoreSelection();
                break;
        }
    }

    // -------------------------------------------------------------------------
    // Commands
    // -------------------------------------------------------------------------

    /**
     * @param {string} url
     * @param {string} label
     */
    createLink(url, label) {
        const link = this.document.createElement("a");
        link.setAttribute("href", url);
        for (const [param, value] of Object.entries(this.config.defaultLinkAttributes || {})) {
            link.setAttribute(param, `${value}`);
        }
        link.innerText = label;
        return link;
    }
    /**
     * @param {string} url
     * @param {string} label
     */
    insertLink(url, label) {
        const link = this.createLink(url, label);
        this.shared.domInsert(link);
        this.dispatch("ADD_STEP");
        const linkParent = link.parentElement;
        const linkOffset = Array.from(linkParent.childNodes).indexOf(link);
        this.shared.setSelection(
            { anchorNode: linkParent, anchorOffset: linkOffset + 1 },
            { normalize: false }
        );
    }
    /**
     * @param {string} text
     * @param {string} url
     */
    getPathAsUrlCommand(text, url) {
        const pasteAsURLCommand = {
            name: _t("Paste as URL"),
            description: _t("Create an URL."),
            fontawesome: "fa-link",
            action: () => {
                this.shared.domInsert(this.createLink(text, url));
                this.dispatch("ADD_STEP");
            },
        };
        return pasteAsURLCommand;
    }
    /**
     * Toggle the Link popover to edit links
     *
     */
    toggleLinkTools(options = {}) {
        const linkElement = this.getOrCreateLink();
        this.linkState.linkElement = linkElement;
    }

    normalizeLink(root = this.editable) {
        // do the sanitizing here
    }

    restoreSelection() {
        const isSelectionRestored =
            this.document.getSelection() === this.shared.getEditableSelection();
        if (!this.overlay.isOpen && !isSelectionRestored) {
            this.shared.setSelection(this.shared.getEditableSelection(), { normalize: false });
        }
    }

    handleSelectionChange() {
        const sel = this.shared.getEditableSelection();
        if (!sel.isCollapsed) {
            this.overlay.close();
        } else {
            const linkEl = closestElement(sel.anchorNode, "A");
            if (!linkEl) {
                this.overlay.close();
                return;
            }
            const props = {
                linkEl,
                onApply: this.applyUrl.bind(this),
                dispatch: this.dispatch,
                close: () => this.overlay.close(),
            };
            if (linkEl !== this.linkState.linkElement) {
                this.overlay.close();
                this.linkState.linkElement = linkEl;
                this.overlay.open({ props });
            }
            if (!this.overlay.isOpen) {
                this.overlay.open({ props });
            }
        }
    }

    applyUrl(newUrl) {
        this.linkState.linkElement.href = newUrl;
        this.overlay.close();
    }

    /**
     * Open the link tools or the image link tool depending on the selection.
     */
    openLinkToolsFromSelection() {
        this.handleSelectionChange();
    }

    /**
     * get the link from the selection or create one if there is none
     */
    getOrCreateLink() {
        const linkElement = findInSelection(this.shared.getEditableSelection(), "a");
        if (linkElement) {
            return linkElement;
        } else {
            // create a new link element
            const link = document.createElement("a");
            const range = getDeepRange(this.editable, { splitText: true, select: true });
            if (range.collapsed) {
                link.appendChild(document.createElement("br"));
                range.insertNode(link);
            } else {
                link.appendChild(range.extractContents());
                range.insertNode(link);
            }
            return link;
        }
    }

    /**
     * Remove the link from the selection
     */
    removeLink() {
        const link = this.linkState.linkElement;
        unwrapContents(link);
    }
}
