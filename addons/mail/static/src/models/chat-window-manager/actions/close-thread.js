/** @odoo-module alias=mail.models.ChatWindowManager.actions.closeThread **/

import action from 'mail.action.define';

/**
 * Closes all chat windows related to the given thread.
 */
export default action({
    name: 'ChatWindowManager/closeThread',
    id: 'mail.models.ChatWindowManager.actions.closeThread',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {ChatWindowManager} chatWindowManager
     * @param {Thread} thread
     * @param {Object} [options]
     */
    func(
        { ctx, env },
        chatWindowManager,
        thread,
        options,
    ) {
        for (const chatWindow of chatWindowManager.chatWindows(ctx)) {
            if (chatWindow.thread(ctx) === thread) {
                env.services.action.dispatch(
                    'ChatWindow/close',
                    chatWindow,
                    options,
                );
            }
        }
    },
});
