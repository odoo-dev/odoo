/** @odoo-module alias=mail.models.MessagingMenu.actions.toggleMobileNewMessage **/

import action from 'mail.action.define';

/**
 * Toggle the visibility of the messaging menu "new message" input in
 * mobile.
 */
export default action({
    name: 'MessagingMenu/toggleMobileNewMessage',
    id: 'mail.models.MessagingMenu.actions.toggleMobileNewMessage',
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
            {
                isMobileNewMessageToggled: !messagingMenu.isMobileNewMessageToggled(ctx),
            },
        );
    },
});
