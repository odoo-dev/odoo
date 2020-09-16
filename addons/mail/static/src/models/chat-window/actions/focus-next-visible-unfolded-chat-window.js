/** @odoo-module alias=mail.models.ChatWindow.actions.focusNextVisibleUnfoldedChatWindow **/

import action from 'mail.action.define';

export default action({
    name: 'ChatWindow/focusNextVisibleUnfoldedChatWindow',
    id: 'mail.models.ChatWindow.actions.focusNextVisibleUnfoldedChatWindow',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {ChatWindow} chatWindow
     */
    func(
        { env },
        chatWindow,
    ) {
        const nextVisibleUnfoldedChatWindow =
            env.services.action.dispatch(
                'ChatWindow/_getNextVisibleUnfoldedChatWindow',
                chatWindow,
            );
        if (nextVisibleUnfoldedChatWindow) {
            env.services.action.dispatch(
                'ChatWindow/focus',
                nextVisibleUnfoldedChatWindow,
            );
        }
    },
});
