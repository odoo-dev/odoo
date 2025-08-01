import { isHtmlContentSupported } from "@html_editor/core/selection_plugin";
import { Plugin } from "@html_editor/plugin";
import { boundariesOut } from "@html_editor/utils/position";
import { withSequence } from "@html_editor/utils/resource";
import { createFileViewer } from "@web/core/file_viewer/file_viewer_hook";
import { _t } from "@web/core/l10n/translation";

export class ImagePreviewPlugin extends Plugin {
    static id = "imagePreview";
    static dependencies = ["selection"];

    resources = {
        user_commands: {
            id: "previewImage",
            description: _t("Preview image"),
            icon: "fa-search-plus",
            run: this.previewImage.bind(this),
            isAvailable: isHtmlContentSupported,
        },
        toolbar_namespaces: [
            {
                id: "image",
                isApplied: (targetedNodes) =>
                    targetedNodes.every(
                        // All nodes should be images or its ancestors
                        (node) => node.nodeName === "IMG" || node.querySelector?.("img")
                    ),
            },
        ],
        toolbar_groups: withSequence(23, { id: "image_preview", namespaces: ["image"] }),
        toolbar_items: {
            id: "image_preview",
            groupId: "image_preview",
            commandId: "previewImage",
        },
    };

    setup() {
        this.fileViewer = createFileViewer();
        this.addDomListener(this.editable, "pointerup", (e) => {
            if (e.target.tagName === "IMG") {
                const [anchorNode, anchorOffset, focusNode, focusOffset] = boundariesOut(e.target);
                const selectionParams = { anchorNode, anchorOffset, focusNode, focusOffset };
                this.dependencies.selection.setSelection(selectionParams);
                this.dependencies.selection.focusEditable();
            }
        });
        this.addDomListener(this.editable, "dblclick", (e) => {
            if (e.target.tagName === "IMG") {
                this.previewImage();
            }
        });
    }

    previewImage() {
        const targetedImg = this.dependencies.selection
            .getTargetedNodes()
            .find((node) => node.tagName === "IMG");
        if (!targetedImg) {
            return;
        }
        let imageName;
        // Keep the result from the first predicate that returns something.
        this.getResource("image_name_predicates").find((p) => {
            imageName = p(targetedImg);
            return imageName;
        });
        const fileModel = {
            isImage: true,
            isViewable: true,
            name: imageName || targetedImg.src,
            defaultSource: targetedImg.src,
            downloadUrl: targetedImg.src,
        };
        this.document.getSelection().collapseToEnd();
        this.fileViewer.open(fileModel);
    }
}
