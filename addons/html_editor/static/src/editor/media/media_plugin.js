import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { Plugin } from "../plugin";
import { ICON_SELECTOR, isIconElement } from "../utils/dom_info";
import { MediaDialog } from "./media_dialog";

const MEDIA_SELECTOR = `${ICON_SELECTOR} , .o_image, .media_iframe_video`;
class MediaPlugin extends Plugin {
    static name = "media";
    static dependencies = ["selection", "history"];
    static resources = (p) => ({
        powerboxCategory: { id: "media", name: _t("Media"), sequence: 20 },
        powerboxCommands: [
            {
                name: _t("Image"),
                description: _t("Insert an image"),
                category: "media",
                fontawesome: "fa-file-image-o",
                action() {
                    p.openMediaDialog();
                },
            },
            {
                name: _t("Video"),
                description: _t("Insert a video"),
                category: "media",
                fontawesome: "fa-file-video-o",
                action() {
                    p.openMediaDialog({
                        noVideos: false,
                        noImages: true,
                        noIcons: true,
                        noDocuments: true,
                    });
                },
            },
        ],
    });

    handleCommand(command, payload) {
        switch (command) {
            case "NORMALIZE":
                this.normalizeMedia(payload.node, payload.clean);
                break;
            case "CLEAN":
                this.clean();
                break;
        }
    }

    normalizeMedia(node, clean) {
        if (clean) {
            return;
        }
        for (const el of node.querySelectorAll(MEDIA_SELECTOR)) {
            el.setAttribute("contenteditable", "false");
            if (isIconElement(el)) {
                el.textContent = "\u200B";
            }
        }
    }

    clean() {
        for (const el of this.editable.querySelectorAll(MEDIA_SELECTOR)) {
            el.removeAttribute("contenteditable");
            if (isIconElement(el)) {
                el.textContent = "";
            }
        }
    }

    onAttachmentChange() {
        // todo @phoenix to implement
    }

    onSaveMediaDialog(element, { node, restoreSelection }) {
        restoreSelection();
        if (!element) {
            // @todo @phoenix to remove
            throw new Error("Element is required: onSaveMediaDialog");
            // return;
        }

        if (node) {
            const changedIcon = isIconElement(node) && isIconElement(element);
            if (changedIcon) {
                // Preserve tag name when changing an icon and not recreate the
                // editors unnecessarily.
                for (const attribute of element.attributes) {
                    node.setAttribute(attribute.nodeName, attribute.nodeValue);
                }
            } else {
                node.replaceWith(element);
            }
        } else {
            const selection = this.shared.getEditableSelection();
            selection.anchorNode.prepend(element);
            this.shared.setCursorEnd(selection.anchorNode);
        }
        this.dispatch("ADD_STEP");
    }

    openMediaDialog(params = {}) {
        const selection = this.shared.getEditableSelection();
        // todo @phoenix to implement getRecordInfo (maybe a service ?)
        const resModel = undefined;
        const resId = undefined;
        const field = undefined;
        const type = undefined;

        const restoreSelection = () => {
            this.shared.setSelection(selection);
        };
        this.services.dialog.add(MediaDialog, {
            resModel,
            resId,
            useMediaLibrary: !!(
                field &&
                ((resModel === "ir.ui.view" && field === "arch") || type === "html")
            ),
            media: params.node,
            save: (element) => {
                this.onSaveMediaDialog(element, { node: params.node, restoreSelection });
            },
            close: restoreSelection,
            onAttachmentChange: this.onAttachmentChange.bind(this),
            ...this.config.mediaModalParams, // todo @phoenix to implement
            ...params,
        });
    }
}

registry.category("phoenix_plugins").add(MediaPlugin.name, MediaPlugin);
