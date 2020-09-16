/** @odoo-module alias=mail.models.ChatWindow.actions.unfold **/

import action from 'mail.action.define';

export default action({
    name: 'ChatWindow/unfold',
    id: 'mail.models.ChatWindow.actions.unfold',
    global: true,
    /**
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
        env.services.action.dispatch(
            'Record/update',
            chatWindow,
            { isFolded: false },
        );
        // Flux specific: manually opening the chat window should save the
        // new state on the server.
        if (chatWindow.thread(ctx) && notifyServer) {
            env.services.action.dispatch(
                'Thread/notifyFoldStateToServer',
                chatWindow.thread(ctx),
                'open',
            );
        }
    },
});
