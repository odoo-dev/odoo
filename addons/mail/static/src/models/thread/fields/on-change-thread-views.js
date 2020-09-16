/** @odoo-module alias=mail.models.Thread.fields.onChangeThreadViews **/

import attr from 'mail.model.field.attr.define';

/**
 * Not a real field, used to trigger `_onChangeThreadViews` when one of
 * the dependencies changes.
 */
export default attr({
    name: 'onChangeThreadViews',
    id: 'mail.models.Thread.fields.onChangeThreadViews',
    global: true,
    dependencies: [
        'threadViews',
    ],
    /**
     * Fetches followers of chats when they are displayed for the first
     * time. This is necessary to clean the followers.
     * @see `onChangeFollowersPartner` for more information.
     *
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Thread} param0.record
     */
    compute({ ctx, env, record }) {
        if (record.threadViews(ctx).length === 0) {
            return;
        }
        if (
            record.channelType(ctx) === 'chat' &&
            !record.areFollowersLoaded(ctx)
        ) {
            env.services.action.dispatch(
                'Thread/refreshFollowers',
                record,
            );
        }
    },
});
