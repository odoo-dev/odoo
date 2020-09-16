/** @odoo-module alias=mail.models.MessagingNotificationHandler.actions._handleNotificationPartnerMarkAsRead **/

import action from 'mail.action.define';

export default action({
    name: 'MessagingNotificationHandler/_handleNotificationPartnerMarkAsRead',
    id: 'mail.models.MessagingNotificationHandler.actions._handleNotificationPartnerMarkAsRead',
    global: true,
    /**
     * @private
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {MessagingNotificationHandler} notificationHandler
     * @param {Object} param2
     * @param {integer[]} [param2.channel_ids
     * @param {integer[]} [param2.message_ids=[]]
     * @param {integer} [param0.needaction_inbox_counter]
     */
    func(
        { ctx, env },
        notificationHandler,
        {
            channel_ids,
            message_ids = [],
            needaction_inbox_counter,
        },
    ) {
        // 1. move messages from inbox to history
        for (const message_id of message_ids) {
            // We need to ignore all not yet known messages because we don't want them
            // to be shown partially as they would be linked directly to mainCache
            // Furthermore, server should not send back all message_ids marked as read
            // but something like last read message_id or something like that.
            // (just imagine you mark 1000 messages as read ... )
            const message = env.services.action.dispatch(
                'Message/findById',
                { id: message_id },
            );
            if (!message) {
                continue;
            }
            // update thread counter
            const originThread = message.originThread(ctx);
            if (originThread && message.isNeedaction(ctx)) {
                env.services.action.dispatch(
                    'Record/update',
                    originThread,
                    {
                        messageNeedactionCounter: env.services.action.dispatch(
                            'RecordFieldCommand/decrement',
                        ),
                    },
                );
            }
            // move messages from Inbox to history
            env.services.action.dispatch(
                'Record/update',
                message,
                {
                    isHistory: true,
                    isNeedaction: false,
                },
            );
        }
        const inbox = env.services.model.messaging.inbox(ctx);
        if (needaction_inbox_counter !== undefined) {
            env.services.action.dispatch(
                'Record/update',
                inbox,
                { counter: needaction_inbox_counter },
            );
        } else {
            // kept for compatibility in stable
            env.services.action.dispatch(
                'Record/update',
                inbox,
                {
                    counter: env.services.action.dispatch(
                        'RecordFieldCommand/decrement',
                        message_ids.length,
                    ),
                },
            );
        }
        if (inbox.counter(ctx) > inbox.mainCache(ctx).fetchedMessages(ctx).length) {
            // Force refresh Inbox because depending on what was marked as
            // read the cache might become empty even though there are more
            // messages on the server.
            env.services.action.dispatch(
                'Record/update',
                inbox.mainCache(ctx),
                { hasToLoadMessages: true },
            );
        }
        // manually force recompute of counter
        env.services.action.dispatch(
            'Record/update',
            notificationHandler.messaging(ctx).messagingMenu(ctx),
        );
    },
});
