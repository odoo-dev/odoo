/** @odoo-module alias=mail.models.ChatWindow.actions.focusPreviousVisibleUnfoldedChatWindow **/

import action from 'mail.action.define';

export default action({
    name: 'ChatWindow/focusPreviousVisibleUnfoldedChatWindow',
    id: 'mail.models.ChatWindow.actions.focusPreviousVisibleUnfoldedChatWindow',
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
        const previousVisibleUnfoldedChatWindow =
            env.services.action.dispatch(
                'ChatWindow/_getNextVisibleUnfoldedChatWindow',
                chatWindow,
                { reverse: true },
            );
        if (previousVisibleUnfoldedChatWindow) {
            env.services.action.dispatch(
                'ChatWindow/focus',
                previousVisibleUnfoldedChatWindow,
            );
        }
    },
});
