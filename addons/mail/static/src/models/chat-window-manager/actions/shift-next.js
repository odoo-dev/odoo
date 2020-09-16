/** @odoo-module alias=mail.models.ChatWindowManager.actions.shiftNext **/

import action from 'mail.action.define';

/**
 * Shift provided chat window to next visible index, which swap visible
 * order of this chat window and the following visible one.
 */
export default action({
    name: 'ChatWindowManager/shiftNext',
    id: 'mail.models.ChatWindowManager.actions.shiftNext',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {ChatWindowManager} chatWindowManager
     * @param {ChatWindow} chatWindow
     */
    func(
        { ctx, env },
        chatWindowManager,
        chatWindow,
    ) {
        const chatWindows = chatWindowManager.allOrdered(ctx);
        const index = chatWindows.findIndex(cw => cw === chatWindow);
        if (index === 0) {
            // already last one
            return;
        }
        const otherChatWindow = chatWindows[index - 1];
        const _newOrdered = [...chatWindowManager._ordered(ctx)];
        _newOrdered[index] = otherChatWindow.localId;
        _newOrdered[index - 1] = chatWindow.localId;
        env.services.action.dispatch(
            'Record/update',
            chatWindowManager,
            { _ordered: _newOrdered });
        env.services.action.dispatch(
            'ChatWindow/focus',
            chatWindow,
        );
    },
});
