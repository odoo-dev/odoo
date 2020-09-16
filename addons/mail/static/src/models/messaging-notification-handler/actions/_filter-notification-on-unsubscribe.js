/** @odoo-module alias=mail.models.MessagingNotificationHandler.actions._filterNotificationsOnUnsubscribe **/

import action from 'mail.action.define';

export default action({
    name: 'MessagingNotificationHandler/_filterNotificationsOnUnsubscribe',
    id: 'mail.models.MessagingNotificationHandler.actions._filterNotificationsOnUnsubscribe',
    global: true,
    /**
     * @private
     * @param {Object} _
     * @param {Object[]} notifications
     * @returns {Object[]}
     */
    func(
        _,
        notifications,
    ) {
        const unsubscribedNotif = notifications.find(
            notif => notif[1].info === 'unsubscribe',
        );
        if (unsubscribedNotif) {
            notifications = notifications.filter(
                notif => (
                    notif[0][1] !== 'mail.channel' ||
                    notif[0][2] !== unsubscribedNotif[1].id
                ),
            );
        }
        return notifications;
    },
});
