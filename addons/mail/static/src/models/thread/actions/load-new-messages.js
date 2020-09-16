/** @odoo-module alias=mail.models.Thread.actions.loadNewMessages **/

import action from 'mail.action.define';

/**
 * Load new messages on the main cache of this thread.
 */
export default action({
    name: 'Thread/loadNewMessages',
    id: 'mail.models.Thread.actions.loadNewMessages',
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
            'ThreadCache/loadnewMessages',
            thread.mainCache(ctx),
        );
    },
});
