/** @odoo-module alias=mail.models.Follower.fields.resModel **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'resModel',
    id: 'mail.models.Follower.fields.resModel',
    global: true,
    default: '',
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {Follower} param0.record
     * @returns {string}
     */
    compute({ ctx, record }) {
        if (record.partner(ctx)) {
            return record.partner(ctx).model(ctx);
        }
        if (record.channel(ctx)) {
            return record.channel(ctx).model(ctx);
        }
        return '';
    },
});
