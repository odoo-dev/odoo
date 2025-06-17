/** @odoo-module */

import {Component, useState} from "@odoo/owl";
import { useService } from '@web/core/utils/hooks';
import { WebClientViewAttachmentViewContainer } from "@mail/components/web_client_view_attachment_view_container/web_client_view_attachment_view_container";

export class ExpensePreview extends Component {
    static template = 'hr_expense.ExpensePreview';
    static components = {WebClientViewAttachmentViewContainer};
    static props = ["attachment"];

    setup() {
        super.setup();
        this.messaging = useService("messaging");
        this.ui = useService("ui");
        if (this.props.attachmentRef) {
            this.props.attachmentRef.current = this;
        }
        this.attachmentPreviewState = useState({
            thread: null,
        });
    }

    async setThread(ExpenseData) {
        if (!ExpenseData || !ExpenseData.data.attachment_ids.records.length) {
            this.thread = null;
            return;
        }
        const attachments = insert(
            ExpenseData.data.attachment_ids.records
                .map(attachment => ({ id: attachment.resId, mimetype: attachment.data.mimetype }))
                .filter(attachment => attachment.mimetype !== 'application/xml')
        );
        const messaging = await this.messaging.get();
        const thread = messaging.models['Thread'].insert({
            attachments,
            id: ExpenseData.data[0],
            model: ExpenseData.relation,
        });
        thread.update({ mainAttachment: thread.attachments[0] });
        this.thread = thread;
    }
}
