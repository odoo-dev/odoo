/** @odoo-module alias=mail.models.ChatWindowManager.actions.closeHiddenMenu **/

import action from 'mail.action.define';

export default action({
    name: 'ChatWindowManager/closeHiddenMenu',
    id: 'mail.models.ChatWindowManager.actions.closeHiddenMenu',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {ChatWindowManager} chatWindowManager
     */
    func(
        { env },
        chatWindowManager,
    ) {
        env.services.action.dispatch(
            'Record/update',
            chatWindowManager,
            { isHiddenMenuOpen: false },
        );
    },
});
