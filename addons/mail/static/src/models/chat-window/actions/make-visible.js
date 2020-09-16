/** @odoo-module alias=mail.models.ChatWindow.actions.makeVisible **/

import action from 'mail.action.define';

export default action({
    name: 'ChatWindow/makeVisible',
    id: 'mail.models.ChatWindow.actions.makeVisible',
    global: true,
    /**
     * Makes this chat window visible by swapping it with the last visible
     * chat window, or do nothing if it is already visible.
     *
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {ChatWindow} chatWindow
     */
    func(
        { ctx, env },
        chatWindow,
    ) {
        if (chatWindow.isVisible(ctx)) {
            return;
        }
        const lastVisible = chatWindow.manager(ctx).lastVisible(ctx);
        env.services.action.dispatch(
            'ChatWindowManager/swap',
            chatWindow.manager(ctx),
            chatWindow,
            lastVisible,
        );
    },
});
