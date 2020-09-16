/** @odoo-module alias=mail.models.MessagingNotificationHandler.actions._handleNotificationChannel **/

import action from 'mail.action.define';

export default action({
    name: 'MessagingNotificationHandler/_handleNotificationChannel',
    id: 'mail.models.MessagingNotificationHandler.actions._handleNotificationChannel',
    global: true,
    /**
     * @private
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {MessagingNotificationHandler} notificationHandler
     * @param {integer} channelId
     * @param {Object} data
     * @param {string} [data.info]
     * @param {boolean} [data.is_typing]
     * @param {integer} [data.last_message_id]
     * @param {integer} [data.partner_id]
     */
    async func(
        { env },
        notificationHandler,
        channelId,
        data,
    ) {
        const {
            info,
            is_typing,
            last_message_id,
            partner_id,
            partner_name,
        } = data;
        switch (info) {
            case 'channel_fetched':
                return env.services.action.dispatch(
                    'MessagingNotificationHandler/_handleNotificationChannelFetched',
                    notificationHandler,
                    channelId,
                    {
                        last_message_id,
                        partner_id,
                    },
                );
            case 'channel_seen':
                return env.services.action.dispatch(
                    'MessagingNotificationHandler/_handleNotificationChannelSeen',
                    notificationHandler,
                    channelId,
                    {
                        last_message_id,
                        partner_id,
                    },
                );
            case 'typing_status':
                return env.services.action.dispatch(
                    'MessagingNotificationHandler/_handleNotificationChannelTypingStatus',
                    notificationHandler,
                    channelId,
                    {
                        is_typing,
                        partner_id,
                        partner_name,
                    },
                );
            default:
                return env.services.action.dispatch(
                    'MessagingNotificationHandler/_handleNotificationChannelMessage',
                    notificationHandler,
                    channelId,
                    data,
                );
        }
    },
});
