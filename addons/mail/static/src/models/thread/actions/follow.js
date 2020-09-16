/** @odoo-module alias=mail.models.Thread.actions.follow **/

import action from 'mail.action.define';

/**
 * Add current user to provided thread's followers.
 */
export default action({
    name: 'Thread/follow',
    id: 'mail.models.Thread.actions.follow',
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
        await env.services.action.dispatch(
            'Record/doAsync',
            thread,
            () => env.services.rpc({
                model: thread.model(ctx),
                method: 'message_subscribe',
                args: [[thread.id(ctx)]],
                kwargs: {
                    partner_ids: [
                        env.services.model.messaging.currentPartner(ctx).id(ctx),
                    ],
                },
            }),
        );
        env.services.action.dispatch(
            'Thread/refreshFollowers',
            thread,
        );
        env.services.action.dispatch(
            'Thread/fetchAndUpdateSuggestedRecipients',
            thread,
        );
    },
});
