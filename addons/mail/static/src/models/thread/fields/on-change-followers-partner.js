/** @odoo-module alias=mail.models.Thread.fields.onChangeFollowersPartner **/

import attr from 'mail.model.field.attr.define';

/**
 * Not a real field, used to trigger `_onChangeFollowersPartner` when one of
 * the dependencies changes.
 */
export default attr({
    name: 'onChangeFollowersPartner',
    id: 'mail.models.Thread.fields.onChangeFollowersPartner',
    global: true,
    dependencies: [
        'followersPartner',
    ],
    /**
     * Cleans followers of current thread. In particular, chats are supposed
     * to work with "members", not with "followers". This clean up is only
     * necessary to remove illegitimate followers in stable version, it can
     * be removed in master after proper migration to clean the database.
     *
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Thread} param0.record
     */
    compute({ ctx, env, record }) {
        if (record.channelType(ctx) !== 'chat') {
            return;
        }
        for (const follower of record.followers(ctx)) {
            if (follower.partner(ctx)) {
                env.services.action.dispatch(
                    'Follower/remove',
                    follower,
                );
            }
        }
    },
});
