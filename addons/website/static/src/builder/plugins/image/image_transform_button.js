import { Component, useState } from "@odoo/owl";
import { useTransformOperations } from "@html_editor/main/media/image_transform_button";
import { _t } from "@web/core/l10n/translation";
import { useDomState } from "@html_builder/core/utils";

export class ImageTransformButton extends Component {
    static template = "html_builder.ImageTransformButton";
    static props = { id: String };

    setup() {
        this.state = useState({ active: false });
        this.domState = useDomState(
            (editingElement) => ({
                applied: editingElement.matches(`[style*="transform"]`)
            })
        );
        this.document = this.env.editor.document;
        this.editable = this.env.editor.editable;
        this.addStep = this.env.editor.shared.history.addStep.bind(this);
        Object.assign(this.props, useTransformOperations(
            this.state,
            this.document,
            this.editable,
            this.addStep,
        ));
    }

    getSelectedImage() {
        const selectedNodes = this.env.editor.shared.selection.getSelectedNodes();
        return selectedNodes.find((node) => node.tagName === "IMG");
    }

    onResetButtonClick() {
        this.resetImageTransformation(this.getSelectedImage());
        if (this.props.isImageTransformationOpen()) {
            this.props.closeImageTransformation();
        }
    }

    resetImageTransformation(image) {
        image.setAttribute(
            "style",
            (image.getAttribute("style") || "").replace(/[^;]*transform[\w:]*;?/g, "")
        );
        this.addStep();
    }

    onTransformButtonClick() {
        let image = this.getSelectedImage();
        if (!this.props.isImageTransformationOpen()) {
            this.props.openImageTransformation(image);
        }
    }
}
