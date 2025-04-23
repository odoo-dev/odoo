import { cropperDataFieldsWithAspectRatio, isGif } from "@html_editor/utils/image_processing";
import { registry } from "@web/core/registry";
import { Plugin } from "@html_editor/plugin";
import { ImageToolOption } from "./image_tool_option";
import { isImageCorsProtected, getMimetype } from "@html_editor/utils/image";
import { withSequence } from "@html_editor/utils/resource";
import { IMAGE_TOOL, ALIGNMENT_STYLE_PADDING } from "@html_builder/utils/option_sequence";

class ImageToolOptionPlugin extends Plugin {
    static id = "imageToolOption";
    static dependencies = ["history", "userCommand", "imagePostProcess", "imageCrop", "media"];
    resources = {
        builder_options: [
            withSequence(IMAGE_TOOL, {
                OptionComponent: ImageToolOption,
                selector: "img",
            }),
            withSequence(ALIGNMENT_STYLE_PADDING, {
                template: "html_builder.ImageAndFaOption",
                selector: "span.fa, i.fa, img",
                exclude: "[data-oe-type='image'] > img, [data-oe-xpath]",
            }),
        ],
        builder_actions: this.getActions(),
        is_hoverable_predicates: (el) => {
            if (el.tagName !== "IMG") {
                return true;
            }
            return this.canHaveHoverEffect(el);
        },
    };
    getActions() {
        return {
            cropImage: {
                isApplied: ({ editingElement }) =>
                    cropperDataFieldsWithAspectRatio.some((field) => editingElement.dataset[field]),
                load: ({ editingElement: img }) =>
                    new Promise((resolve) => {
                        this.dependencies.imageCrop.openCropImage(img, {
                            onClose: resolve,
                            onSave: async (newDataset) => {
                                resolve(
                                    this.dependencies.imagePostProcess.processImage(img, newDataset)
                                );
                            },
                        });
                    }),
                apply: ({ loadResult: updateImageAttributes }) => {
                    updateImageAttributes?.();
                },
            },
            resetCrop: {
                load: async ({ editingElement: img }) => {
                    const newDataset = Object.fromEntries(
                        cropperDataFieldsWithAspectRatio.map((field) => [field, undefined])
                    );
                    return this.dependencies.imagePostProcess.processImage(img, newDataset);
                },
                apply: ({ loadResult: updateImageAttributes }) => {
                    updateImageAttributes();
                },
            },
            transformImage: {
                isApplied: ({ editingElement }) => editingElement.matches(`[style*="transform"]`),
                apply: () => {
                    this.dependencies.userCommand.getCommand("transformImage").run();
                },
            },
            resetTransformImage: {
                apply: ({ editingElement }) => {
                    editingElement.setAttribute(
                        "style",
                        (editingElement.getAttribute("style") || "").replace(
                            /[^;]*transform[\w:]*;?/g,
                            ""
                        )
                    );
                },
            },
            replaceMedia: {
                load: async ({ editingElement }) => {
                    let icon;
                    await this.dependencies.media.openMediaDialog({
                        node: editingElement,
                        save: (newIcon) => {
                            icon = newIcon;
                        },
                    });
                    return icon;
                },
                apply: ({ editingElement, loadResult: newImage }) => {
                    if (!newImage) {
                        return;
                    }
                    editingElement.replaceWith(newImage);
                },
            },
        };
    }
    async canHaveHoverEffect(img) {
        return (
            !this.isDeviceShape(img) &&
            !this.isAnimatedShape(img) &&
            this.isImageSupportedForShapes(img) &&
            !(await isImageCorsProtected(img))
        );
    }
    isDeviceShape(img) {
        const shapeName = img.dataset.shape;
        if (!shapeName) {
            return false;
        }
        const shapeCategory = shapeName.split("/")[1];
        return shapeCategory === "devices";
    }
    isAnimatedShape(img) {
        // todo: to implement while implementing the animated shapes
        return false;
    }
    isImageSupportedForShapes(img) {
        return img.dataset.originalId && isImageSupportedForProcessing(getMimetype(img));
    }
}
registry.category("website-plugins").add(ImageToolOptionPlugin.id, ImageToolOptionPlugin);

/**
 * @param {String} mimetype
 * @param {Boolean} [strict=false] if true, even partially supported images (GIFs)
 *     won't be accepted.
 * @returns {Boolean}
 */
function isImageSupportedForProcessing(mimetype, strict = false) {
    if (isGif(mimetype)) {
        return !strict;
    }
    return ["image/jpeg", "image/png", "image/webp"].includes(mimetype);
}
