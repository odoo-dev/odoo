/** @odoo-module alias=mail.models.MessagingNotificationHandler.actions._handleNotificationChannelSeen **/

import action from 'mail.action.define';

/**
 * Called when a channel has been seen, and the server responds with the
 * last message seen. Useful in order to track last message seen.
 */
export default action({
    name: 'MessagingNotificationHandler/_handleNotificationChannelSeen',
    id: 'mail.models.MessagingNotificationHandler.actions._handleNotificationChannelSeen',
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
        },
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
        const lastMessage = env.services.action.dispatch(
            'Message/insert',
            { id: last_message_id },
        );
        // restrict computation of seen indicator for "non-channel" channels
        // for performance reasons
        const shouldComputeSeenIndicators = channel.channelType(ctx) !== 'channel';
        if (shouldComputeSeenIndicators) {
            env.services.action.dispatch(
                'ThreadPartnerSeenInfo/insert',
                {
                    channelId: channel.id(ctx),
                    lastSeenMessage: env.services.action.dispatch(
                        'RecordFieldCommand/link',
                        lastMessage,
                    ),
                    partnerId: partner_id,
                },
            );
            env.services.action.dispatch(
                'MessageSeenIndicator/insert',
                {
                    channelId: channel.id(ctx),
                    messageId: lastMessage.id(ctx),
                },
            );
        }
        if (
            env.services.model.messaging.currentPartner(ctx).id(ctx) ===
            partner_id
        ) {
            env.services.action.dispatch(
                'Record/update',
                channel,
                {
                    lastSeenByCurrentPartnerMessageId: last_message_id,
                    pendingSeenMessageId: undefined,
                },
            );
        }
        if (shouldComputeSeenIndicators) {
            // FIXME force the computing of thread values (cf task-2261221)
            env.services.action.dispatch(
                'Thread/computeLastCurrentPartnerMessageSeenByEveryone',
                channel,
            );
            // FIXME force the computing of message values (cf task-2261221)
            env.services.action.dispatch(
                'MessageSeenIndicator/recomputeSeenValues',
                channel,
            );
        }
        // manually force recompute of counter
        env.services.action.dispatch(
            'Record/update',
            notificationHandler.messaging(ctx).messagingMenu(ctx),
        );
    },
});
