/** @odoo-module alias=mail.models.ChatWindow.actions.shiftNext **/

import action from 'mail.action.define';

export default action({
    name: 'ChatWindow/shiftNext',
    id: 'mail.models.ChatWindow.actions.shiftNext',
    global: true,
    /**
     * Shift this chat window to next visible position.
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
        env.services.action.dispatch(
            'ChatWindowManager/shiftNext',
            chatWindow.manager(ctx),
            chatWindow,
        );
    },
});
