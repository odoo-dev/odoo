/** @odoo-module alias=mail.models.MessagingNotificationHandler.actions._handleNotificationPartner **/

import action from 'mail.action.define';

export default action({
    name: 'MessagingNotificationHandler/_handleNotificationPartner',
    id: 'mail.models.MessagingNotificationHandler.actions._handleNotificationPartner',
    global: true,
    /**
     * @private
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {MessagingNotificationHandler} notificationHandler
     * @param {Object} data
     * @param {string} [data.info]
     * @param {string} [data.type]
     */
    async func(
        { env },
        notificationHandler,
        data,
    ) {
        const {
            info,
            type,
        } = data;
        if (type === 'activity_updated') {
            env.bus.trigger('activity_updated', data);
        } else if (type === 'author') {
            return env.services.action.dispatch(
                'MessagingNotificationHandler/_handleNotificationPartnerAuthor',
                notificationHandler,
                data,
            );
        } else if (info === 'channel_seen') {
            return env.services.action.dispatch(
                'MessagingNotificationHandler/_handleNotificationChannelSeen',
                notificationHandler,
                data.channel_id,
                data,
            );
        } else if (type === 'deletion') {
            return env.services.action.dispatch(
                'MessagingNotificationHandler/_handleNotificationPartnerDeletion',
                notificationHandler,
                data,
            );
        } else if (type === 'message_notification_update') {
            return env.services.action.dispatch(
                'MessagingNotificationHandler/_handleNotificationPartnerMessageNotificationUpdate',
                notificationHandler,
                data.elements,
            );
        } else if (type === 'mark_as_read') {
            return env.services.action.dispatch(
                'MessagingNotificationHandler/_handleNotificationPartnerMarkAsRead',
                notificationHandler,
                data,
            );
        } else if (type === 'moderator') {
            return env.services.action.dispatch(
                'MessagingNotificationHandler/_handleNotificationPartnerModerator',
                notificationHandler,
                data,
            );
        } else if (type === 'simple_notification') {
            const escapedMessage = owl.utils.escape(data.message);
            env.services['notification'].notify({
                message: escapedMessage,
                sticky: data.sticky,
                type: data.warning ? 'warning' : 'danger',
            });
        } else if (type === 'toggle_star') {
            return env.services.action.dispatch(
                'MessagingNotificationHandler/_handleNotificationPartnerToggleStar',
                notificationHandler,
                data,
            );
        } else if (info === 'transient_message') {
            return env.services.action.dispatch(
                'MessagingNotificationHandler/_handleNotificationPartnerTransientMessage',
                notificationHandler,
                data,
            );
        } else if (info === 'unsubscribe') {
            return env.services.action.dispatch(
                'MessagingNotificationHandler/_handleNotificationPartnerUnsubscribe',
                notificationHandler,
                data.id,
            );
        } else if (type === 'user_connection') {
            return env.services.action.dispatch(
                'MessagingNotificationHandler/_handleNotificationPartnerUserConnection',
                notificationHandler,
                data,
            );
        } else if (!type) {
            return env.services.action.dispatch(
                'MessagingNotificationHandler/_handleNotificationPartnerChannel',
                notificationHandler,
                data,
            );
        }
    },
});
