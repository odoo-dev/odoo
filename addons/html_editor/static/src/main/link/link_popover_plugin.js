import { Plugin } from "@html_editor/plugin";
import { prepareUpdate } from "@html_editor/utils/dom_state";
import { closestElement } from "@html_editor/utils/dom_traversal";
import { leftPos } from "@html_editor/utils/position";
import { callbacksForCursorUpdate, findInSelection } from "@html_editor/utils/selection";
import { _t } from "@web/core/l10n/translation";
import { LinkPopover } from "./link_popover";
import { cleanZWChars } from "./utils";
import { unwrapContents } from "@html_editor/utils/dom";

export class LinkPopoverPlugin extends Plugin {
    static name = "link_popover";
    static dependencies = ["dom", "link", "selection", "overlay"];
    static resources = (p) => ({
        toolbarCategory: {
            id: "link",
            sequence: 40,
        },
        toolbarItems: [
            {
                id: "link",
                category: "link",
                action(dispatch) {
                    dispatch("CREATE_LINK_ON_SELECTION");
                },
                icon: "fa-link",
                name: "link",
                label: _t("Link"),
                isFormatApplied: isLinkActive,
            },
            {
                id: "unlink",
                category: "link",
                action(dispatch) {
                    dispatch("REMOVE_LINK_FROM_SELECTION");
                },
                icon: "fa-unlink",
                name: "unlink",
                label: _t("Remove Link"),
                isAvailable: isSelectionHasLink,
            },
        ],

        powerboxCategory: { id: "navigation", name: _t("Navigation"), sequence: 50 },
        powerboxItems: [
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
    handleCommand(command, payload) {
        switch (command) {
            case "TOGGLE_LINK_TOOLS":
                this.toggleLinkTools(payload.options);
                break;
        }
    }
    setup() {
        this.overlay = this.shared.createOverlay(LinkPopover);
        this.addDomListener(this.editable, "click", (ev) => {
            if (ev.target.tagName === "A" && ev.target.isContentEditable) {
                ev.preventDefault();
                this.toggleLinkTools({ link: ev.target });
            }
        });
        this.services.command.add(
            "Create link",
            () => {
                this.toggleLinkTools();
            },
            {
                hotkey: "control+k",
                isAvailable: () => this.shared.getEditableSelection().inEditable,
            }
        );
    }

    handleSelectionChange(selection) {
        if (!selection.isCollapsed) {
            this.overlay.close();
        } else if (!selection.inEditable) {
            const selection = this.document.getSelection();
            // note that data-prevent-closing-overlay also used in color picker but link popover
            // and color picker don't open at the same time so it's ok to query like this
            const popoverEl = document.querySelector("[data-prevent-closing-overlay=true]");
            if (popoverEl?.contains(selection.anchorNode)) {
                return;
            }
            this.overlay.close();
        } else {
            const linkEl = closestElement(selection.anchorNode, "A");
            if (!linkEl) {
                this.overlay.close();
                this.removeCurrentLinkIfEmtpy();
                return;
            }
            if (linkEl !== this.linkElement) {
                this.removeCurrentLinkIfEmtpy();
                this.overlay.close();
                this.linkElement = linkEl;
            }

            const props = {
                linkEl,
                onApply: (url, label, classes) => {
                    this.linkElement.href = url;
                    if (cleanZWChars(this.linkElement.innerText) === label) {
                        this.overlay.close();
                        this.shared.setSelection(this.shared.getEditableSelection());
                    } else {
                        const restore = prepareUpdate(...leftPos(this.linkElement));
                        this.linkElement.innerText = label;
                        restore();
                        this.overlay.close();
                        this.shared.setCursorEnd(this.linkElement);
                    }
                    if (classes) {
                        this.linkElement.className = classes;
                    } else {
                        this.linkElement.removeAttribute("class");
                    }
                    this.dispatch("ADD_STEP");
                    this.removeCurrentLinkIfEmtpy();
                },
                onRemove: () => {
                    this.removeLink();
                    this.overlay.close();
                    this.dispatch("ADD_STEP");
                },
                onCopy: () => {
                    this.overlay.close();
                },
                onClose: () => {
                    this.overlay.close();
                },
            };
            // pass the link element to overlay to prevent position change
            this.overlay.open({ target: this.linkElement, props });
        }
    }
    removeCurrentLinkIfEmtpy() {
        if (this.linkElement && cleanZWChars(this.linkElement.innerText) === "") {
            this.linkElement.remove();
        }
        if (this.linkElement && !this.linkElement.href) {
            this.removeLink();
            this.dispatch("ADD_STEP");
        }
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
    /**
     * get the link from the selection or create one if there is none
     *
     * @return {HTMLElement}
     */
    getOrCreateLink() {
        const selection = this.shared.getEditableSelection();
        const linkElement = findInSelection(selection, "a");
        if (linkElement) {
            if (
                !linkElement.contains(selection.anchorNode) ||
                !linkElement.contains(selection.focusNode)
            ) {
                this.shared.splitSelection();
                const selectedNodes = this.shared.getSelectedNodes();
                let before = linkElement.previousSibling;
                while (before !== null && selectedNodes.includes(before)) {
                    linkElement.insertBefore(before, linkElement.firstChild);
                    before = linkElement.previousSibling;
                }
                let after = linkElement.nextSibling;
                while (after !== null && selectedNodes.includes(after)) {
                    linkElement.appendChild(after);
                    after = linkElement.nextSibling;
                }
                this.shared.setCursorEnd(linkElement);
                this.dispatch("ADD_STEP");
            }
            return linkElement;
        } else {
            // create a new link element
            const link = this.document.createElement("a");
            if (!selection.isCollapsed) {
                const content = this.shared.extractContent(selection);
                link.append(content);
            }
            this.shared.domInsert(link);
            this.shared.setCursorEnd(link);
            this.dispatch("ADD_STEP");
            return link;
        }
    }
    /**
     * Remove the link from the collapsed selection
     */
    removeLink() {
        const link = this.linkElement;
        const cursors = this.shared.preserveSelection();
        if (link && link.isContentEditable) {
            cursors.update(callbacksForCursorUpdate.unwrap(link));
            unwrapContents(link);
        }
        cursors.restore();
        this.linkElement = null;
    }
}

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

function isSelectionHasLink(selection) {
    return findInSelection(selection, "a") ? true : false;
}
