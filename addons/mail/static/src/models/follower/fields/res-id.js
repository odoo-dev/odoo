/** @odoo-module alias=mail.models.Follower.fields.resId **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'resId',
    id: 'mail.models.Follower.fields.resId',
    global: true,
    default: 0,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {Follower} param0.record
     * @returns {integer}
     */
    compute({ ctx, record }) {
        if (record.partner(ctx)) {
            return record.partner(ctx).id(ctx);
        }
        if (record.channel(ctx)) {
            return record.channel(ctx).id(ctx);
        }
        return 0;
    },
});
