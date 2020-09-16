/** @odoo-module alias=mail.models.MessagingNotificationHandler.actions.start **/

import action from 'mail.action.define';

/**
 * Fetch messaging data initially to populate the store specifically for
 * the current users. This includes pinned channels for instance.
 */
export default action({
    name: 'MessagingNotificationHandler/start',
    id: 'mail.models.MessagingNotificationHandler.actions.start',
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
        env.services.bus_service.onNotification(
            null,
            notifs => env.services.action.dispatch(
                'MessagingNotificationHandler/_handleNotifications',
                messagingNotificationHandler,
                notifs,
            ),
        );
        env.services.bus_service.startPolling();
    },
});
