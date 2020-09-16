/** @odoo-module alias=mail.models.ChatWindowManager.actions.openHiddenMenu **/

import action from 'mail.action.define';

export default action({
    name: 'ChatWindowManager/openHiddenMenu',
    id: 'mail.models.ChatWindowManager.actions.openHiddenMenu',
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
            { isHiddenMenuOpen: true },
        );
    },
});
