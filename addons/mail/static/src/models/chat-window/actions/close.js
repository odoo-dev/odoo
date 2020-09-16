/** @odoo-module alias=mail.models.ChatWindow.actions.close **/

import action from 'mail.action.define';

export default action({
    name: 'ChatWindow/close',
    id: 'mail.models.ChatWindow.actions.close',
    global: true,
    /**
     * Close this chat window.
     *
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {ChatWindow} chatWindow
     * @param {Object} [param2={}]
     * @param {boolean} [param2.notifyServer]
     */
    func(
        { ctx, env },
        chatWindow,
        { notifyServer } = {},
    ) {
        if (notifyServer === undefined) {
            notifyServer = !env.services.model.messaging.device(ctx).isMobile(ctx);
        }
        const thread = chatWindow.thread(ctx);
        env.services.action.dispatch(
            'Record/delete',
            chatWindow,
        );
        // Flux specific: 'closed' fold state should only be saved on the
        // server when manually closing the chat window. Delete at destroy
        // or sync from server value for example should not save the value.
        if (thread && notifyServer) {
            env.services.action.dispatch(
                'Thread/notifyFoldStateToServer',
                thread,
                'closed',
            );
        }
        if (
            env.services.model.messaging.device(ctx).isMobile(ctx) &&
            !env.services.model.messaging.discuss(ctx).isOpen(ctx)
        ) {
            // If we are in mobile and discuss is not open, it means the
            // chat window was opened from the messaging menu. In that
            // case it should be re-opened to simulate it was always
            // there in the background.
            env.services.action.dispatch(
                'Record/update',
                env.services.model.messaging.messagingMenu(ctx),
                { isOpen: true },
            );
        }
    },
});
