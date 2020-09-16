/** @odoo-module alias=mail.models.MessagingMenu.actions.toggleOpen **/

import action from 'mail.action.define';

/**
 * Toggle whether the messaging menu is open or not.
 */
export default action({
    name: 'MessagingMenu/toggleOpen',
    id: 'mail.models.MessagingMenu.actions.toggleOpen',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {MessagingMenu} messagingMenu
     */
    func(
        { ctx, env },
        messagingMenu,
    ) {
        env.services.action.dispatch(
            'Record/update',
            messagingMenu,
            { isOpen: !messagingMenu.isOpen(ctx) },
        );
    },
});
