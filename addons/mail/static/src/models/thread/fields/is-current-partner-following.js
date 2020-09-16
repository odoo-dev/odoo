/** @odoo-module alias=mail.models.Thread.fields.isCurrentPartnerFollowing **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'isCurrentPartnerFollowing',
    id: 'mail.models.Thread.fields.isCurrentPartnerFollowing',
    global: true,
    default: false,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Thread} param0.record
     * @returns {boolean}
     */
    compute({ ctx, env, record }) {
        return record.followers(ctx).some(
            follower => (
                follower.partner(ctx) &&
                (
                    follower.partner(ctx) ===
                    env.services.model.messaging.currentPartner(ctx)
                )
            ),
        );
    },
});
