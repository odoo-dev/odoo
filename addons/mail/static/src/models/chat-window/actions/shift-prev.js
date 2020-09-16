/** @odoo-module alias=mail.models.ChatWindow.actions.shiftPrev **/

import action from 'mail.action.define';

export default action({
    name: 'ChatWindow/shiftPrev',
    id: 'mail.models.ChatWindow.actions.shiftPrev',
    global: true,
    /**
     * Shift this chat window to previous visible position.
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
            'ChatWindowManager/shiftPrev',
            chatWindow.manager(ctx),
            chatWindow,
        );
    },
});
