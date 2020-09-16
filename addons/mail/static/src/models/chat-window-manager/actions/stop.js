/** @odoo-module alias=mail.models.ChatWindowManager.actions.stop **/

import action from 'mail.action.define';

export default action({
    name: 'ChatWindowManager/stop',
    id: 'mail.models.ChatWindowManager.actions.stop',
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
        env.services.model.messagingBus.off(
            'hide_home_menu',
            null,
            chatWindowManager._onHideHomeMenu,
        );
        env.services.model.messagingBus.off(
            'show_home_menu',
            null,
            chatWindowManager._onShowHomeMenu,
        );
        Object.assign(chatWindowManager, {
            _onHideHomeMenu: () => {},
            _onShowHomeMenu: () => {},
        });
    },
});
