/** @odoo-module alias=mail.models.MessagingNotificationHandler.actions._handleNotifications **/

import action from 'mail.action.define';

export default action({
    name: 'MessagingNotificationHandler/_handleNotifications',
    id: 'mail.models.MessagingNotificationHandler.actions._handleNotifications',
    global: true,
    /**
     * @private
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {MessagingNotificationHandler} notificationHandler
     * @param {Object[]} notifications
     * @param {Array|string} notifications[i][0] meta-data of the notification.
     * @param {string} notifications[i][0][0] name of database this
     *   notification comes from.
     * @param {string} notifications[i][0][1] type of notification.
     * @param {integer} notifications[i][0][2] usually id of related type
     *   of notification. For instance, with `mail.channel`, this is the id
     *   of the channel.
     * @param {Object} notifications[i][1] payload of the notification
     */
    async func(
        { ctx, env },
        notificationHandler,
        notifications,
    ) {
        const filteredNotifications =
            env.services.action.dispatch(
                'MessagingNotificationHandler/_filterNotificationsOnUnsubscribe',
                notifications,
            );
        const proms = filteredNotifications.map(
            notification => {
                const [channel, message] = notification;
                if (typeof channel === 'string') {
                    // uuid notification, only for (livechat) public handler
                    return;
                }
                const [, model, id] = channel;
                switch (model) {
                    case 'ir.needaction':
                        return env.services.action.dispatch(
                            'MessagingNotificationHandler/_handleNotificationNeedaction',
                            notificationHandler,
                            message,
                        );
                    case 'mail.channel':
                        return env.services.action.dispatch(
                            'MessagingNotificationHandler/_handleNotificationChannel',
                            notificationHandler,
                            id,
                            message,
                        );
                    case 'res.partner':
                        if (id !== env.services.model.messaging.currentPartner(ctx).id(ctx)) {
                            // ignore broadcast to other partners
                            return;
                        }
                        return env.services.action.dispatch(
                            'MessagingNotificationHandler/_handleNotificationPartner',
                            notificationHandler,
                            message,
                        );
                }
            },
        );
        await env.services.action.dispatch(
            'Record/doAsync',
            notificationHandler,
            () => Promise.all(proms),
        );
    },
});
