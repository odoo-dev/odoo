/** @odoo-module alias=mail.models.ChatWindowManager.actions.closeAll **/

import action from 'mail.action.define';

/**
 * Close all chat windows.
 */
export default action({
    name: 'ChatWindowManager/closeAll',
    id: 'mail.models.ChatWindowManager.actions.closeAll',
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
        const chatWindows = chatWindowManager.allOrdered(ctx);
        for (const chatWindow of chatWindows) {
            env.services.action.dispatch(
                'ChatWindow/close',
                chatWindow,
            );
        }
    },
});
