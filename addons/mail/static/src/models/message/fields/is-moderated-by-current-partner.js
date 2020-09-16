/** @odoo-module alias=mail.models.Message.fields.isModeratedByCurrentPartner **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'isModeratedByCurrentPartner',
    id: 'mail.models.Message.fields.isModeratedByCurrentPartner',
    global: true,
    default: false,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {Message} param0.record
     * @returns {boolean}
     */
    compute({ ctx, record }) {
        return (
            record.moderationStatus(ctx) === 'pending_moderation' &&
            record.originThread(ctx) &&
            record.originThread(ctx).isModeratedByCurrentPartner(ctx)
        );
    },
});
