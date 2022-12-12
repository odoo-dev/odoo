/* @odoo-module */

import { Component, xml } from "@odoo/owl";
import { AttachmentViewer } from "./attachment_viewer";

/**
 * @typedef {Object} Props
 * @property {import("@mail/new/core/attachment_model").Attachment[]} attachments
 * @extends {Component<Props, Env>}
 */
export class AttachmentViewerContainer extends Component {
    static template = xml`
    <div t-if="props.attachments.length > 0" class="modal fixed-top bottom-0 d-flex justify-content-center">
        <AttachmentViewer attachments="props.attachments"/>
    </div>`;
    static components = { AttachmentViewer };
    static props = ["attachments"];
}
