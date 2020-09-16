/** @odoo-module alias=mail.models.MessagingMenu.actions.close **/

import action from 'mail.action.define';

export default action({
    name: 'MessagingMenu/close',
    id: 'mail.models.MessagingMenu.actions.close',
    global: true,
    /**
     * Close the messaging menu. Should reset its internal state.
     *
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {MessagingMenu} messagingMenu
     */
    func(
        { env },
        messagingMenu,
    ) {
        env.services.action.dispatch(
            'Record/update',
            messagingMenu,
            { isOpen: false },
        );
    },
});
