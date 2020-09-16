/** @odoo-module alias=mail.models.Thread.actions.open **/

import action from 'mail.action.define';

/**
 * Opens this thread either as form view, in discuss app, or as a chat
 * window. The thread will be opened in an "active" matter, which will
 * interrupt current user flow.
 */
export default action({
    name: 'Thread/open',
    id: 'mail.models.Thread.actions.open',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Thread} thread
     * @param {Object} [param2]
     * @param {boolean} [param2.expanded=false]
     */
    async func(
        { ctx, env },
        thread,
        { expanded = false } = {},
    ) {
        const discuss = env.services.model.messaging.discuss(ctx);
        // check if thread must be opened in form view
        if (!['mail.box', 'mail.channel'].includes(thread.model(ctx))) {
            if (expanded || discuss.isOpen(ctx)) {
                // Close chat window because having the same thread opened
                // both in chat window and as main document does not look
                // good.
                env.services.action.dispatch(
                    'ChatWindowManager/closeThread',
                    env.services.model.messaging.chatWindowManager(ctx),
                    thread,
                );
                await env.services.action.dispatch(
                    'Messaging/openDocument', {
                    id: thread.id(ctx),
                    model: thread.model(ctx),
                });
                return;
            }
        }
        // check if thread must be opened in discuss
        const device = env.services.model.messaging.device(ctx);
        if (
            (
                !device.isMobile(ctx) &&
                (discuss.isOpen(ctx) || expanded)
            ) ||
            thread.model(ctx) === 'mail.box'
        ) {
            env.services.action.dispatch(
                'Discuss/openThread',
                discuss,
                thread,
            );
        }
        // thread must be opened in chat window
        await env.services.action.dispatch(
            'ChatWindowManager/openThread',
            env.services.model.messaging.chatWindowManager(ctx),
            thread,
            { makeActive: true },
        );
    },
});
