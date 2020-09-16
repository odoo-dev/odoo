/** @odoo-module alias=mail.models.ChatWindowManager.actions.openNewMessage **/

import action from 'mail.action.define';

export default action({
    name: 'ChatWindowManager/openNewMessage',
    id: 'mail.models.ChatWindowManager.actions.openNewMessage',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {ChatWindowManager} chatWindowManager
     */
    func(
        { ctx, env },
        chatWindowManager,
    ) {
        let newMessageChatWindow = chatWindowManager.newMessageChatWindow(ctx);
        if (!newMessageChatWindow) {
            newMessageChatWindow = env.services.action.dispatch(
                'ChatWindow/create',
                {
                    manager:
                        env.services.action.dispatch(
                            'RecordFieldCommand/link',
                            chatWindowManager,
                        ),
                },
            );
        }
        env.services.action.dispatch(
            'ChatWindow/makeActive',
            newMessageChatWindow,
        );
    },
});
