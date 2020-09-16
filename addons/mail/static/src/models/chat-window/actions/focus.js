/** @odoo-module alias=mail.models.ChatWindow.actions.focus **/

import action from 'mail.action.define';

export default action({
    name: 'ChatWindow/focus',
    id: 'mail.models.ChatWindow.actions.focus',
    global: true,
    /**
     * Programmatically auto-focus an existing chat window.
     *
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {ChatWindow} chatWindow
     */
    func(
        { env },
        chatWindow,
    ) {
        env.services.action.dispatch(
            'Record/update',
            chatWindow,
            { isDoFocus: true },
        );
    },
});
