import { registry } from "@web/core/registry";
import { Plugin } from "../plugin";
import { _t } from "@web/core/l10n/translation";
import { isImageUrl } from "@html_editor/utils/url";

function hasShape(imagePlugin, shapeName) {
    return () => imagePlugin.isSelectionShaped(shapeName);
}

export class ImagePlugin extends Plugin {
    static name = "image";
    static dependencies = ["history", "link", "powerbox", "dom", "selection"];
    /** @type { (p: ImagePlugin) => Record<string, any> } */
    static resources(p) {
        return {
            handle_paste_url: p.handlePasteUrl.bind(p),

            toolbarGroup: [
                {
                    id: "image_shape",
                    sequence: 25,
                    namespace: "IMG",
                    buttons: [
                        {
                            id: "shape_rounded",
                            cmd: "SHAPE_ROUNDED",
                            name: "Shape: Rounded",
                            icon: "fa-square",
                            isFormatApplied: hasShape(p, "rounded"),
                        },
                        {
                            id: "shape_circle",
                            cmd: "SHAPE_CIRCLE",
                            name: "Shape: Circle",
                            icon: "fa-circle-o",
                            isFormatApplied: hasShape(p, "rounded-circle"),
                        },
                        {
                            id: "shape_shadow",
                            cmd: "SHAPE_SHADOW",
                            name: "Shape: Shadow",
                            icon: "fa-sun-o",
                            isFormatApplied: hasShape(p, "shadow"),
                        },
                        {
                            id: "shape_thumbnail",
                            cmd: "SHAPE_THUMBNAIL",
                            name: "Shape: Thumbnail",
                            icon: "fa-picture-o",
                            isFormatApplied: hasShape(p, "img-thumbnail"),
                        },
                    ],
                },
            ],
        };
    }

    setup() {
        this.addDomListener(this.editable, "mouseup", (e) => {
            if (e.target.tagName === "IMG") {
                const range = this.document.createRange();
                range.selectNode(e.target);
                this.shared.setSelection({
                    anchorNode: range.startContainer,
                    anchorOffset: range.startOffset,
                    focusNode: range.endContainer,
                    focusOffset: range.endOffset,
                });
            }
        });
    }

    handleCommand(command) {
        const commandToClassNameDict = {
            SHAPE_ROUNDED: "rounded",
            SHAPE_SHADOW: "shadow",
            SHAPE_CIRCLE: "rounded-circle",
            SHAPE_THUMBNAIL: "img-thumbnail",
        };

        switch (command) {
            case "SHAPE_ROUNDED":
            case "SHAPE_SHADOW":
            case "SHAPE_CIRCLE":
            case "SHAPE_THUMBNAIL": {
                const selectedNodes = this.shared.getSelectedNodes();
                const selectedImg = selectedNodes.find((node) => node.tagName === "IMG");
                selectedImg.classList.toggle(commandToClassNameDict[command]);
                this.dispatch("ADD_STEP");
            }
        }
    }

    isSelectionShaped(shape) {
        const selectedNodes = this.shared
            .getTraversedNodes()
            .filter((n) => n.tagName === "IMG" && n.classList.contains(shape));
        return selectedNodes.length > 0;
    }

    /**
     * @param {string} text
     * @param {string} url
     */
    handlePasteUrl(text, url) {
        if (isImageUrl(url)) {
            const restoreSavepoint = this.shared.makeSavePoint();
            // Open powerbox with commands to embed media or paste as link.
            // Insert URL as text, revert it later if a command is triggered.
            this.shared.domInsert(text);
            this.dispatch("ADD_STEP");
            const embedImageCommand = {
                name: _t("Embed Image"),
                description: _t("Embed the image in the document."),
                fontawesome: "fa-image",
                action: () => {
                    const img = document.createElement("IMG");
                    img.setAttribute("src", url);
                    this.shared.domInsert(img);
                    this.dispatch("ADD_STEP");
                },
            };
            const commands = [embedImageCommand, this.shared.getPathAsUrlCommand(text, url)];
            this.shared.openPowerbox({ commands, onApplyCommand: restoreSavepoint });
            return true;
        }
    }
}
registry.category("phoenix_plugins").add(ImagePlugin.name, ImagePlugin);
