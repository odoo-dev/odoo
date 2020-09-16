/** @odoo-module alias=mail.models.Thread.actions.unsubscribe **/

import action from 'mail.action.define';

/**
 * Unsubscribe current user from provided channel.
 */
export default action({
    name: 'Thread/unsubscribe',
    id: 'mail.models.Thread.actions.unsubscribe',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Thread} thread
     */
    func(
        { ctx, env },
        thread,
    ) {
        env.services.action.dispatch(
            'ChatWindowManager/closeThread',
            env.services.model.messaging.chatWindowManager(ctx),
            thread,
        );
        env.services.action.dispatch(
            'Thread/unpin',
            thread,
        );
    },
});
