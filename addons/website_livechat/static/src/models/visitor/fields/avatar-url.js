/** @odoo-module alias=website_livechat.models.Visitor.fields.avatarUrl **/

import attr from 'mail.model.field.attr.define';

/**
 * Url to the avatar of the visitor.
 */
export default attr({
    name: 'avatarUrl',
    id: 'website_livechat.models.Visitor.fields.avatarUrl',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {Visitor} param0.record
     * @returns {string}
     */
     compute({ ctx, record }) {
        if (!record.partner(ctx)) {
            return '/mail/static/src/img/smiley/avatar.jpg';
        }
        return record.partner(ctx).avatarUrl(ctx);
    },
});
