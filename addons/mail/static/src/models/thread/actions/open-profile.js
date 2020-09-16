/** @odoo-module alias=mail.models.Thread.actions.openProfile **/

import action from 'mail.action.define';

/**
 * Opens the most appropriate view that is a profile for this thread.
 */
export default action({
    name: 'Thread/openProfile',
    id: 'mail.models.Thread.actions.openProfile',
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
        return env.services.action.dispatch(
            'Messaging/openDocument',
            {
                id: thread.id(ctx),
                model: thread.model(ctx),
            },
        );
    },
});
