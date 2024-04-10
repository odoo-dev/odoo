import { _t } from "@web/core/l10n/translation";
import { Plugin } from "@html_editor/plugin";
import { findInSelection } from "@html_editor/utils/selection";
import { closestElement } from "@html_editor/utils/dom_traversal";
import { LinkPopover } from "./link_popover";
import { unwrapContents } from "@html_editor/utils/dom";

/**
 * @typedef {import("@html_editor/core/selection_plugin").EditorSelection} EditorSelection
 */

/**
 * @param {EditorSelection} selection
 */
function isLinkActive(selection) {
    const linkElementAnchor = closestElement(selection.anchorNode, "A");
    const linkElementFocus = closestElement(selection.focusNode, "A");
    if (linkElementFocus && linkElementAnchor) {
        return linkElementAnchor === linkElementFocus;
    }
    if (linkElementAnchor || linkElementFocus) {
        return true;
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
                    icon: "fa-link",
                    name: "link",
                    label: _t("Link"),
                    isFormatApplied: () => isLinkActive(p.shared.getEditableSelection()),
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
                    dispatch("TOGGLE_LINK");
                },
            },
            {
                name: _t("Button"),
                description: _t("Add a button"),
                category: "navigation",
                fontawesome: "fa-link",
                action(dispatch) {
                    dispatch("TOGGLE_LINK");
                },
            },
        ],
        onSelectionChange: p.handleSelectionChange.bind(p),
    });
    setup() {
        this.overlay = this.shared.createOverlay(LinkPopover, { position: "bottom-start" });
        this.addDomListener(this.editable, "click", (ev) => {
            if (ev.target.tagName === "A") {
                ev.preventDefault();
                this.toggleLinkTools({ link: ev.target });
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
     * @param {Object} options
     * @param {HTMLElement} options.link
     */
    toggleLinkTools({ link } = {}) {
        if (!link) {
            link = this.getOrCreateLink();
        }
        this.linkElement = link;
    }

    normalizeLink(root = this.editable) {
        // do the sanitizing here
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
                onApply: (url) => {
                    this.linkElement.href = url;
                    this.overlay.close();
                    this.shared.setSelection(this.shared.getEditableSelection());
                },
                onRemove: () => {
                    this.removeLink();
                    this.overlay.close();
                    this.shared.setSelection(this.shared.getEditableSelection());
                },
            };
            if (linkEl !== this.linkElement) {
                this.overlay.close();
                this.linkElement = linkEl;
                this.overlay.open({ target: this.linkElement, props });
            } else {
                // pass the link element to overlay to prevent position change
                this.overlay.open({ target: linkEl, props });
            }
            if (!this.overlay.isOpen) {
                this.overlay.open({ props });
            }
        }
    }

    /**
     * Open the link tools or the image link tool depending on the selection.
     */
    openLinkToolsFromSelection() {
        this.handleSelectionChange();
    }

    /**
     * get the link from the selection or create one if there is none
     *
     * @return {HTMLElement}
     */
    getOrCreateLink() {
        const selection = this.shared.getEditableSelection();
        const linkElement = findInSelection(selection, "a");
        if (linkElement) {
            return linkElement;
        } else {
            // create a new link element
            const link = this.document.createElement("a");
            if (selection.isCollapsed) {
                // todo: handle this case
            } else {
                const content = this.shared.extractContent(selection);
                link.append(content);
            }
            this.shared.domInsert(link);
            this.shared.setSelection({
                anchorNode: link,
                anchorOffset: 0,
                focusNode: link,
                focusOffset: link.childNodes.length,
            });
            this.dispatch("ADD_STEP");
            return link;
        }
    }

    /**
     * Remove the link from the selection
     */
    removeLink() {
        const link = this.linkElement;
        unwrapContents(link);
    }
}
