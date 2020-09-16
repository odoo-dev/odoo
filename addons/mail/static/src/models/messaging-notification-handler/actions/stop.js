/** @odoo-module alias=mail.models.MessagingNotificationHandler.actions.stop **/

import action from 'mail.action.define';

export default action({
    name: 'MessagingNotificationHandler/stop',
    id: 'mail.models.MessagingNotificationHandler.actions.stop',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {MessagingNotificationHandler} messagingNotificationHandler
     */
    func(
        { env },
        messagingNotificationHandler,
    ) {
        env.services['bus_service'].off('notification');
        env.services['bus_service'].stopPolling();
    },
});
