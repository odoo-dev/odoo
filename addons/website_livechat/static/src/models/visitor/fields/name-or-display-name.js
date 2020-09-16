/** @odoo-module alias=website_livechat.models.Visitor.fields.nameOrDisplayName **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'nameOrDisplayName',
    id: 'website_livechat.models.Visitor.fields.nameOrDisplayName',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {Visitor} param0.record
     * @returns {string}
     */
    compute({ ctx, record }) {
        if (record.partner(ctx)) {
            return record.partner(ctx).nameOrDisplayName(ctx);
        }
        return record.displayName(ctx);
    },
});
