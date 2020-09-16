/** @odoo-module alias=mail.models.Follower.actions.remove **/

import action from 'mail.action.define';

/**
 * Remove this follower from its related thread.
 */
export default action({
    name: 'Follower/remove',
    id: 'mail.models.Follower.actions.remove',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Follower} follower
     */
    async func(
        { ctx, env },
        follower,
    ) {
        const partner_ids = [];
        const channel_ids = [];
        if (follower.partner(ctx)) {
            partner_ids.push(follower.partner(ctx).id(ctx));
        } else {
            channel_ids.push(follower.channel(ctx).id(ctx));
        }
        await env.services.action.dispatch(
            'Record/doAsync',
            follower,
            () => env.services.rpc({
                model: follower.followedThread(ctx).model(ctx),
                method: 'message_unsubscribe',
                args: [
                    [follower.followedThread(ctx).id(ctx)],
                    partner_ids,
                    channel_ids
                ],
            }),
        );
        const followedThread = follower.followedThread(ctx);
        env.services.action.dispatch(
            'Record/delete',
            follower,
        );
        env.services.action.dispatch(
            'Thread/fetchAndUpdateSuggestedRecipients',
            followedThread,
        );
    },
});
