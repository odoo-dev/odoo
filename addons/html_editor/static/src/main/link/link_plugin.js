import { _t } from "@web/core/l10n/translation";
import { Plugin } from "@html_editor/plugin";
import { closestElement } from "@html_editor/utils/dom_traversal";
import { LinkPopover } from "./link";
import { reactive } from "@odoo/owl";

function isLinkActive(editable) {
    const selection = editable.ownerDocument.getSelection();
    const linkElement = closestElement(selection.anchorNode, "A");
    return linkElement;
}

export class LinkPlugin extends Plugin {
    static name = "link";
    static dependencies = ["dom", "selection", "overlay"];
    // @phoenix @todo: do we want to have createLink and insertLink methods in link plugin?
    static shared = ["createLink", "insertLink", "getPathAsUrlCommand"];
    static resources = (p) => ({
        toolbarGroup: {
            id: "link",
            sequence: 40,
            buttons: [
                {
                    id: "link",
                    cmd: "CREATE_LINK_ON_SELECTION",
                    cmdPayload: { options: { editing: true } },
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
                    dispatch("TOGGLE_LINK", { options: { forceDialog: true } });
                },
            },
            {
                name: _t("Button"),
                description: _t("Add a button"),
                category: "navigation",
                fontawesome: "fa-link",
                action(dispatch) {
                    dispatch("TOGGLE_LINK", { options: { forceDialog: true } });
                },
            },
        ],
        onSelectionChange: p.handleSelectionChange.bind(p),
    });
    setup() {
        this.linkState = reactive({ linkElement: null });
        this.overlay = this.shared.createOverlay(LinkPopover, {
            dispatch: this.dispatch,
            el: this.editable,
            offset: () => 0,
            linkState: this.linkState,
        });
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
     */
    toggleLinkTools(options = {}) {
        const selection = this.shared.getEditableSelection();
        const linkElement = closestElement(selection.anchorNode, "A");
        this.linkState.linkElement = linkElement;
    }

    normalizeLink(root = this.editable) {
        // do the sanitizing here
    }

    handleSelectionChange() {
        const sel = this.shared.getEditableSelection();
        const linkel = closestElement(sel.anchorNode, "A");
        if (!linkel) {
            this.overlay.close();
        }
        if (linkel && linkel !== this.linkState.linkElement) {
            this.overlay.close();
            this.linkState.linkElement = linkel;
            this.overlay.open();
        }
        if (linkel && !this.overlay.isOpen) {
            this.overlay.open();
        }
    }

    /**
     * Open the link tools or the image link tool depending on the selection.
     */
    openLinkToolsFromSelection() {
        this.toggleLinkTools();
    }
}
