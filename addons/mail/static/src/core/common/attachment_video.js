import { useRef, useState } from "@odoo/owl";
import { AttachmentUtils } from "@mail/core/common/attachment_utils";
import { AttachmentActions } from "@mail/core/common/attachment_actions";

/**
 * @typedef {Object} Props
 * @property {import("models").Attachment} attachment
 * @property {number} maxHeight
 * @property {number} maxWidth
 * @property {boolean} showDelete
 * @extends {AttachmentUtils<Props, Env>}
 */
export class AttachmentVideo extends AttachmentUtils {
    static template = "mail.AttachmentVideo";
    static components = { AttachmentActions };
    static props = [...AttachmentUtils.props, "attachment", "maxHeight", "maxWidth", "showDelete"];

    setup() {
        super.setup();
        this.state = useState({ paused: true });
        this.videoRefEl = useRef("videoRef");
    }

    onClickPlay() {
        if (this.videoRefEl.el && this.canPlay) {
            this.state.paused = false;
            this.videoRefEl.el.play();
            this.videoRefEl.el.setAttribute("controls", "controls");
        }
    }

    /**
     * @param {MouseEvent} ev
     */
    onClickAttachment(ev) {
        if (!this.props.attachment.uploading && this.env.inComposer) {
            ev.stopPropagation();
            ev.preventDefault();
            this.env.openFileViewer(this.props.attachment);
        }
    }

    onPause() {
        if (this.videoRefEl.el) {
            this.state.paused = true;
            this.videoRefEl.el.removeAttribute("controls");
        }
    }

    get canPlay() {
        return !this.props.attachment.uploading && !this.env.inComposer;
    }
}
