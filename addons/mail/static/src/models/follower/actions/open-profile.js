/** @odoo-module alias=mail.models.Follower.actions.openProfile **/

import action from 'mail.action.define';

/**
 * Opens the most appropriate view that is a profile for this follower.
 */
export default action({
    name: 'Follower/openProfile',
    id: 'mail.models.Follower.actions.openProfile',
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
        if (follower.partner(ctx)) {
            return env.services.action.dispatch(
                'Partner/openProfile',
                follower.partner(ctx),
            );
        }
        return env.services.action.dispatch(
            'Thread/openProfile',
            follower.channel(ctx),
        );
    },
});
