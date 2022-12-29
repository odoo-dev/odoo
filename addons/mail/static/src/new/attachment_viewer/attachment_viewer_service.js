/* @odoo-module */

import { reactive } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { AttachmentViewerContainer } from "./attachment_viewer_container";

export const attachmentViewerService = {
    start() {
        const state = reactive({
            attachments: [],
            startIndex: 0,
        });
        registry.category("main_components").add("mail.AttachmentViewerContainer", {
            Component: AttachmentViewerContainer,
            props: { attachments: state.attachments },
        });

        /**
         * @param {import("@mail/new/core/attachment_model").Attachment} attachment
         * @param {import("@mail/new/core/attachment_model").Attachment[]} attachments
         */
        function open(attachment, attachments = []) {
            if (!attachment.isViewable) {
                return;
            }
            if (attachments.length > 0) {
                const viewableAttachments = attachments.filter(
                    (attachment) => attachment.isViewable
                );
                const index = viewableAttachments.indexOf(attachment);
                state.attachments.push(...viewableAttachments);
                state.startIndex = index;
            } else {
                state.attachments.push([attachment]);
            }
        }

        function close() {
            state.attachments.splice(0);
            state.startIndex = 0;
        }

        return { open, close, state };
    },
};

registry.category("services").add("attachmentViewer", attachmentViewerService);
