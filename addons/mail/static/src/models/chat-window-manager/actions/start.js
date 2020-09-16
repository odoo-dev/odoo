/** @odoo-module alias=mail.models.ChatWindowManager.actions.start **/

import action from 'mail.action.define';

export default action({
    name: 'ChatWindowManager/start',
    id: 'mail.models.ChatWindowManager.actions.start',
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
        const _onHideHomeMenu = () => env.services.action.dispatch(
            'ChatWindowManager/_onHideHomeMenu',
            chatWindowManager,
        );
        const _onShowHomeMenu = () => env.services.action.dispatch(
            'ChatWindowManager/_onShowHomeMenu',
            chatWindowManager,
        );
        Object.assign(chatWindowManager, {
            _onHideHomeMenu,
            _onShowHomeMenu,
        });
        env.services.model.messagingBus.on(
            'hide_home_menu',
            null,
            chatWindowManager._onHideHomeMenu(),
        );
        env.services.model.messagingBus.on(
            'show_home_menu',
            null,
            chatWindowManager._onShowHomeMenu(),
        );
    },
});
