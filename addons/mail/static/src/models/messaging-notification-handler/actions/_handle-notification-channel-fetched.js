/** @odoo-module alias=mail.models.MessagingNotificationHandler.actions._handleNotificationChannelFetched **/

import action from 'mail.action.define';

export default action({
    name: 'MessagingNotificationHandler/_handleNotificationChannelFetched',
    id: 'mail.models.MessagingNotificationHandler.actions._handleNotificationChannelFetched',
    global: true,
    /**
     * @private
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {MessagingNotificationHandler} notificationHandler
     * @param {integer} channelId
     * @param {Object} param3
     * @param {integer} param3.last_message_id
     * @param {integer} param3.partner_id
     */
    async func(
        { ctx, env },
        notificationHandler,
        channelId,
        {
            last_message_id,
            partner_id,
        }
    ) {
        const channel = env.services.action.dispatch(
            'Thread/findById',
            {
                id: channelId,
                model: 'mail.channel',
            },
        );
        if (!channel) {
            // for example seen from another browser, the current one has no
            // knowledge of the channel
            return;
        }
        if (channel.channelType(ctx) === 'channel') {
            // disabled on `channel` channels for performance reasons
            return;
        }
        env.services.action.dispatch(
            'ThreadPartnerSeenInfo/insert',
            {
                channelId: channel.id(ctx),
                lastFetchedMessage: env.services.action.dispatch(
                    'RecordFieldCommand/insert',
                    { id: last_message_id },
                ),
                partnerId: partner_id,
            },
        );
        env.services.action.dispatch(
            'MessageSeenIndicator/insert',
            {
                channelId: channel.id(ctx),
                messageId: last_message_id,
            },
        );
        // FIXME force the computing of message values (cf task-2261221)
        env.services.action.dispatch(
            'MessageSeenIndicator/recomputeFetchedValues',
            channel,
        );
    },
});
