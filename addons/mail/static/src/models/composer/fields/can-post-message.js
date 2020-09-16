/** @odoo-module alias=mail.models.Composer.fields.canPostMessage **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'canPostMessage',
    id: 'mail.models.Composer.fields.canPostMessage',
    global: true,
    default: false,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {Composer} param0.record
     * @returns {boolean}
     */
    compute({ ctx, record }) {
        if (
            !record.textInputContent(ctx) &&
            record.attachments(ctx).length === 0
        ) {
            return false;
        }
        return (
            !record.hasUploadingAttachment(ctx) &&
            !record.isPostingMessage(ctx)
        );
    },
});
