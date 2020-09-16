/** @odoo-module alias=mail.models.ChatWindowManager.actions._onShowHomeMenu **/

import action from 'mail.action.define';

export default action({
    name: 'ChatWindowManager/_onShowHomeMenu',
    id: 'mail.models.ChatWindowManager.actions._onShowHomeMenu',
    global: true,
    /**
     * @private
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {ChatWindowManager} chatWindowManager
     */
    func(
        { ctx, env },
        chatWindowManager,
    ) {
        for (const chatWindow of chatWindowManager.chatWindows(ctx)) {
            if (!chatWindow.threadView(ctx)) {
                return;
            }
            env.services.action.dispatch(
                'ThreadView/addComponentHint',
                chatWindow.threadView(ctx),
                'home-menu-shown',
            );
        }
    },
});
