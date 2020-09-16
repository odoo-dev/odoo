/** @odoo-module alias=mail.models.Thread.actions.unfollow **/

import action from 'mail.action.define';

/**
 * Unfollow current partner from this thread.
 */
export default action({
    name: 'Thread/unfollow',
    id: 'mail.models.Thread.actions.unfollow',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Thread} thread
     */
    async func(
        { ctx, env },
        thread,
    ) {
        const currentPartnerFollower = thread.followers(ctx).find(
            follower => (
                follower.partner(ctx) ===
                env.services.model.messaging.currentPartner(ctx)
            ),
        );
        await env.services.action.dispatch(
            'Record/doAsync',
            thread,
            () => env.services.action.dispatch(
                'Follower/remove',
                currentPartnerFollower,
            ),
        );
    },
});
