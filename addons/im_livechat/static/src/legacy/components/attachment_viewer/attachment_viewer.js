/** @odoo-module **/

import { useComponentToModel } from "@im_livechat/legacy/component_hooks/use_component_to_model";
import { useRefToModel } from "@im_livechat/legacy/component_hooks/use_ref_to_model";
import { useUpdateToModel } from "@im_livechat/legacy/component_hooks/use_update_to_model";
import { registerMessagingComponent } from "@im_livechat/legacy/utils/messaging_component";

import { Component, onMounted } from "@odoo/owl";

export class AttachmentViewer extends Component {
    /**
     * @override
     */
    setup() {
        super.setup();
        useComponentToModel({ fieldName: "component" });
        useRefToModel({ fieldName: "imageRef", refName: "image" });
        useRefToModel({ fieldName: "zoomerRef", refName: "zoomer" });
        useRefToModel({ fieldName: "iframeViewerPdfRef", refName: "iframeViewerPdf" });
        useUpdateToModel({ methodName: "onComponentUpdate" });
        onMounted(() => this._mounted());
    }

    _mounted() {
        if (!this.root.el) {
            return;
        }
        this.root.el.focus();
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @returns {AttachmentViewer}
     */
    get attachmentViewer() {
        return this.props.record;
    }
}

Object.assign(AttachmentViewer, {
    props: { record: Object },
    template: "im_livechat.AttachmentViewer",
});

registerMessagingComponent(AttachmentViewer);
