/** @odoo-module alias=mail.models.ChatWindowManager.actions.openThread **/

import action from 'mail.action.define';

export default action({
    name: 'ChatWindowManager/openThread',
    id: 'mail.models.ChatWindowManager.actions.openThread',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {ChatWindowManager} chatWindowManager
     * @param {Thread} thread
     * @param {Object} [param3={}]
     * @param {boolean} [param3.isFolded=false]
     * @param {boolean} [param3.makeActive=false]
     * @param {boolean} [param3.notifyServer]
     * @param {boolean} [param3.replaceNewMessage=false]
     */
    func(
        { ctx, env },
        chatWindowManager,
        thread,
        {
            isFolded = false,
            makeActive = false,
            notifyServer,
            replaceNewMessage = false,
        } = {},
    ) {
        if (notifyServer === undefined) {
            notifyServer = !env.services.model.messaging.device(ctx).isMobile(ctx);
        }
        let chatWindow = chatWindowManager.chatWindows(ctx).find(
            chatWindow => chatWindow.thread(ctx) === thread,
        );
        if (!chatWindow) {
            chatWindow = env.services.action.dispatch(
                'ChatWindow/create',
                {
                    isFolded: isFolded,
                    manager: env.services.action.dispatch(
                        'RecordFieldCommand/link',
                        chatWindowManager,
                    ),
                    thread: env.services.action.dispatch(
                        'RecordFieldCommand/link',
                        thread,
                    ),
                },
            );
        } else {
            env.services.action.dispatch(
                'Record/update',
                chatWindow,
                { isFolded: isFolded },
            );
        }
        if (replaceNewMessage && chatWindowManager.newMessageChatWindow(ctx)) {
            env.services.action.dispatch(
                'ChatWindowManager/swap',
                chatWindowManager,
                chatWindow,
                chatWindowManager.newMessageChatWindow(ctx),
            );
            env.services.action.dispatch(
                'ChatWindow/close',
                chatWindowManager.newMessageChatWindow(ctx),
            );
        }
        if (makeActive) {
            // avoid double notify at this step, it will already be done at
            // the end of the current method
            env.services.action.dispatch(
                'ChatWindow/makeActive',
                chatWindow,
                { notifyServer: false },
            );
        }
        // Flux specific: notify server of chat window being opened.
        if (notifyServer) {
            const foldState = chatWindow.isFolded(ctx)
                ? 'folded'
                : 'open';
            env.services.action.dispatch(
                'Thread/notifyFoldStateToServer',
                thread,
                foldState,
            );
        }
    },
});
