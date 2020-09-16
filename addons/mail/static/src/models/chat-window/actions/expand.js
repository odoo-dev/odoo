/** @odoo-module alias=mail.models.ChatWindow.actions.expand **/

import action from 'mail.action.define';

export default action({
    name: 'ChatWindow/expand',
    id: 'mail.models.ChatWindow.actions.expand',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {ChatWindow} chatWindow
     */
    func(
        { ctx, env },
        chatWindow,
    ) {
        if (chatWindow.thread(ctx)) {
            env.services.action.dispatch(
                'Thread/open',
                chatWindow.thread(ctx),
                { expanded: true },
            );
        }
    },
});
