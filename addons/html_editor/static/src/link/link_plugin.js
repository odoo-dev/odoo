import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { Plugin } from "../plugin";
import { findInSelection } from "../utils/selection";
import { closestBlock } from "../utils/blocks";

// const customizableLinksSelector =
//     "a" +
//     ':not([data-bs-toggle="tab"])' +
//     ':not([data-bs-toggle="collapse"])' +
//     ':not([data-bs-toggle="dropdown"])' +
//     ":not(.dropdown-item)";

// @todo @phoenix: fix the closestBlock function to be able to use it in the link plugin
function isLinkActive() {
    return function (editable) {
        const selection = editable.ownerDocument.getSelection();
        const block = closestBlock(selection.anchorNode);
        return block?.tagName === "A";
    };
}

export class LinkPlugin extends Plugin {
    static name = "link";
    static dependencies = ["selection"];
    static shared = [];
    static resources = (p) => ({
        toolbarGroup: {
            id: "link",
            sequence: 40,
            buttons: [
                {
                    id: "link",
                    cmd: "TOGGLE_LINK",
                    cmdPayload: { options: { mode: "A" } },
                    icon: "fa-link",
                    name: "link",
                    label: _t("Link"),
                    isFormatApplied: isLinkActive(),
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
    });

    handleCommand(command, payload) {
        switch (command) {
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
     * Toggle the Link tools/dialog to edit links. If a snippet menu is present,
     * use the link tools, otherwise use the dialog.
     *
     * @param {boolean} [options.forceOpen] default: false
     * @param {boolean} [options.forceDialog] force to open the dialog
     * @param {boolean} [options.link] The anchor element to edit if it is known.
     * @param {boolean} [options.shoudFocusUrl=true] Disable the automatic focusing of the URL field.
     */
    toggleLinkTools(options = {}) {
        // ...
        // const shouldFocusUrl = options.shouldFocusUrl === undefined ? true : options.shouldFocusUrl;
        const linkEl = findInSelection(this.shared.getEditableSelection(), "a");
        if (
            linkEl &&
            (!linkEl.matches(this.customizableLinksSelector) || !linkEl.isContentEditable)
        ) {
            return;
        }

        // TODO: history step pause

        // TODO: get/create link

        // TODO: open the link dialog
    }

    normalizeLink(root = this.editable) {
        // ...
    }

    /**
     * Open the link tools or the image link tool depending on the selection.
     */
    openLinkToolsFromSelection() {
        // TODO: open link tools
        // const targetEl = this.odooEditor.document.getSelection().getRangeAt(0).startContainer;
        // // Link tool is different if the selection is an image or a text.
        // if (targetEl.nodeType === Node.ELEMENT_NODE
        //         && (targetEl.tagName === 'IMG' || targetEl.querySelectorAll('img').length === 1)) {
        //     this.odooEditor.dispatchEvent(new Event('activate_image_link_tool'));
        //     return;
        // }

        // TODO maybe have another component for the image link tool?
        this.toggleLinkTools();
    }
}

registry.category("phoenix_plugins").add(LinkPlugin.name, LinkPlugin);
