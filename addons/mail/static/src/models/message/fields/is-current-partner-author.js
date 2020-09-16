/** @odoo-module alias=mail.models.Message.fields.isCurrentPartnerAuthor **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'isCurrentPartnerAuthor',
    id: 'mail.models.Message.fields.isCurrentPartnerAuthor',
    global: true,
    default: false,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {Message} param0.record
     * @returns {boolean}
     */
    compute({ ctx, record }) {
        if (!record.messaging(ctx)) {
            return false;
        }
        if (!record.messaging(ctx).currentPartner(ctx)) {
            return false;
        }
        if (!record.author(ctx)) {
            return false;
        }
        return (
            record.messaging(ctx).currentPartner(ctx) ===
            record.author(ctx)
        );
    },
});
