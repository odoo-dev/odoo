/** @odoo-module alias=mail.models.MessagingNotificationHandler.actions._handleNotificationChannelMessage **/

import action from 'mail.action.define';

export default action({
    name: 'MessagingNotificationHandler/_handleNotificationChannelMessage',
    id: 'mail.models.MessagingNotificationHandler.actions._handleNotificationChannelMessage',
    global: true,
    /**
     * @private
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {MessagingNotificationHandler} notificationHandler
     * @param {integer} channelId
     * @param {Object} messageData
     */
    async func(
        { ctx, env },
        notificationHandler,
        channelId,
        messageData,
    ) {
        let channel = env.services.action.dispatch(
            'Thread/findById',
            {
                id: channelId,
                model: 'mail.channel',
            },
        );
        const wasChannelExisting = !!channel;
        const convertedData = env.services.action.dispatch(
            'Message/convertData',
            messageData,
        );
        const oldMessage = env.services.action.dispatch(
            'Message/findById',
            convertedData,
        );
        // locally save old values, as insert would overwrite them
        const oldMessageModerationStatus = (
            oldMessage && oldMessage.moderationStatus(ctx)
        );
        const oldMessageWasModeratedByCurrentPartner = (
            oldMessage && oldMessage.isModeratedByCurrentPartner(ctx)
        );
        // Fetch missing info from channel before going further. Inserting
        // a channel with incomplete info can lead to issues. This is in
        // particular the case with the `uuid` field that is assumed
        // "required" by the rest of the code and is necessary for some
        // features such as chat windows.
        if (!channel) {
            channel = (
                await env.services.action.dispatch(
                    'Record/doAsync',
                    notificationHandler,
                    () => env.services.action.dispatch(
                        'Thread/performRpcChannelInfo',
                        { ids: [channelId] },
                    ),
                )
            )[0];
        }
        if (!channel.isPinned(ctx)) {
            env.services.action.dispatch(
                'Thread/pin',
                channel,
            );
        }
        const message = env.services.action.dispatch(
            'Message/insert',
            convertedData,
        );
        env.services.action.dispatch(
            'MessagingNotificationHandler/_notifyThreadViewsMessageReceived',
            notificationHandler,
            message,
        );
        // If the message was already known: nothing else should be done,
        // except if it was pending moderation by the current partner, then
        // decrement the moderation counter.
        if (oldMessage) {
            if (
                oldMessageModerationStatus === 'pending_moderation' &&
                message.moderationStatus(ctx) !== 'pending_moderation' &&
                oldMessageWasModeratedByCurrentPartner
            ) {
                const moderation = env.services.model.messaging.moderation(ctx);
                env.services.action.dispatch(
                    'Record/update',
                    moderation,
                    {
                        counter: env.services.action.dispatch(
                            'RecordFieldCommand/decrement',
                        ),
                    },
                );
            }
            return;
        }
        // If the current partner is author, do nothing else.
        if (
            message.author(ctx) ===
            env.services.model.messaging.currentPartner(ctx)
        ) {
            return;
        }
        // Message from mailing channel should not make a notification in
        // Odoo for users with notification "Handled by Email".
        // Channel has been marked as read server-side in this case, so
        // it should not display a notification by incrementing the
        // unread counter.
        if (
            channel.isMassMailing(ctx) &&
            env.session.notification_type === 'email'
        ) {
            return;
        }
        // In all other cases: update counter and notify if necessary.
        // Chat from OdooBot is considered disturbing and should only be
        // shown on the menu, but no notification and no thread open.
        const isChatWithOdooBot = (
            channel.correspondent(ctx) &&
            channel.correspondent(ctx) === env.services.model.messaging.partnerRoot(ctx)
        );
        if (!isChatWithOdooBot) {
            const isOdooFocused = env.services['bus_service'].isOdooFocused();
            // Notify if out of focus
            if (!isOdooFocused && channel.isChatChannel(ctx)) {
                env.services.action.dispatch(
                    'MessagingNotificationHandler/_notifyNewChannelMessageWhileOutOfFocus',
                    notificationHandler,
                    {
                        channel,
                        message,
                    },
                );
            }
            if (
                channel.model(ctx) === 'mail.channel' &&
                channel.channelType(ctx) !== 'channel'
            ) {
                // disabled on non-channel threads and
                // on `channel` channels for performance reasons
                env.services.action.dispatch(
                    'Thread/markAsFetched',
                    channel,
                );
            }
            // (re)open chat on receiving new message
            if (
                channel.channelType(ctx) !== 'channel' &&
                !env.services.model.messaging.device(ctx).isMobile(ctx)
            ) {
                env.services.action.dispatch(
                    'ChatWindowManager/openThread',
                    env.services.model.messaging.chatWindowManager(ctx),
                    channel,
                );
            }
        }
        // If the channel wasn't known its correct counter was fetched at
        // the start of the method, no need update it here.
        if (!wasChannelExisting) {
            return;
        }
        // manually force recompute of counter
        env.services.action.dispatch(
            'Record/update',
            notificationHandler.messaging(ctx).messagingMenu(ctx),
        );
    },
});
