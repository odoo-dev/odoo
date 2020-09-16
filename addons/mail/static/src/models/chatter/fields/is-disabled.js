/** @odoo-module alias=mail.models.Chatter.fields.isDisabled **/

import attr from 'mail.model.fields.attr.define';

export default attr({
    name: 'isDisabled',
    id: 'mail.models.Chatter.fields.isDisabled',
    global: true,
    default: false,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {Chatter} param0.record
     * @returns {boolean}
     */
    compute({ ctx, record }) {
        return (
            !record.thread(ctx) ||
            record.thread(ctx).isTemporary(ctx)
        );
    },
});
