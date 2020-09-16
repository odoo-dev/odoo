/** @odoo-module alias=mail.models.Attachment.actions.view **/

import action from 'mail.action.define';

export default action({
    name: 'Attachment/view',
    id: 'mail.models.Attachment.actions.view',
    global: true,
    /**
     * View provided attachment(s), with given attachment initially. Prompts
     * the attachment viewer.
     *
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Object} param1
     * @param {Attachment} [param1.attachment]
     * @param {Attachments[]} param1.attachments
     * @returns {string|undefined} unique id of open dialog, if open
     */
    func(
        { ctx, env },
        {
            attachment,
            attachments,
        },
    ) {
        const hasOtherAttachments = attachments && attachments.length > 0;
        if (!attachment && !hasOtherAttachments) {
            return;
        }
        if (!attachment && hasOtherAttachments) {
            attachment = attachments[0];
        } else if (attachment && !hasOtherAttachments) {
            attachments = [attachment];
        }
        if (!attachments.includes(attachment)) {
            return;
        }
        env.services.action.dispatch(
            'DialogManager/open',
            env.services.model.messaging.dialogManager(ctx),
            'AttachmentViewer',
            {
                attachment: env.services.action.dispatch(
                    'RecordFieldCommand/link',
                    attachment,
                ),
                attachments: env.services.action.dispatch(
                    'RecordFieldCommand/replace',
                    attachments,
                ),
            },
        );
    },
});
