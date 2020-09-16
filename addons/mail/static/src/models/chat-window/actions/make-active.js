/** @odoo-module alias=mail.models.ChatWindow.actions.makeActive **/

import action from 'mail.action.define';

export default action({
    name: 'ChatWindow/makeActive',
    id: 'mail.models.ChatWindow.actions.makeActive',
    global: true,
    /**
     * Makes this chat window active, which consists of making it visible,
     * unfolding it, and focusing it.
     *
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {ChatWindow} chatWindow
     * @param {Object} [options]
     */
    func(
        { env },
        chatWindow,
        options,
    ) {
        env.services.action.dispatch(
            'ChatWindow/makeVisible',
            chatWindow,
        );
        env.services.action.dispatch(
            'ChatWindow/unfold',
            chatWindow,
            options,
        );
        env.services.action.dispatch(
            'ChatWindow/focus',
            chatWindow,
        );
    },
});
