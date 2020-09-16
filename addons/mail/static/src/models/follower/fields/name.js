/** @odoo-module alias=mail.models.Follower.fields.name **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'name',
    id: 'mail.models.Follower.fields.name',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {Follower} param0.record
     * @returns {string}
     */
    compute({ ctx, record }) {
        if (record.channel(ctx)) {
            return record.channel(ctx).name(ctx);
        }
        if (record.partner(ctx)) {
            return record.partner(ctx).name(ctx);
        }
        return '';
    },
});
