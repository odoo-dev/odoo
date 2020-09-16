/** @odoo-module alias=mail.models.ChatWindowManager.actions.swap **/

import action from 'mail.action.define';

export default action({
    name: 'ChatWindowManager/swap',
    id: 'mail.models.ChatWindowManager.actions.swap',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {ChatWindowManager} chatWindowManager
     * @param {ChatWindow} chatWindow1
     * @param {ChatWindow} chatWindow2
     */
    func(
        { ctx, env },
        chatWindowManager,
        chatWindow1,
        chatWindow2,
    ) {
        const ordered = chatWindowManager.allOrdered(ctx);
        const index1 = ordered.findIndex(
            chatWindow => chatWindow === chatWindow1,
        );
        const index2 = ordered.findIndex(
            chatWindow => chatWindow === chatWindow2,
        );
        if (index1 === -1 || index2 === -1) {
            return;
        }
        const _newOrdered = [...chatWindowManager._ordered(ctx)];
        _newOrdered[index1] = chatWindow2.localId;
        _newOrdered[index2] = chatWindow1.localId;
        env.services.action.dispatch(
            'Record/update',
            chatWindowManager,
            { _ordered: _newOrdered },
        );
    },
});
