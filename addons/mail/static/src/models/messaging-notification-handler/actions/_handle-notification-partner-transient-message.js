/** @odoo-module alias=mail.models.MessagingNotificationHandler.actions._handleNotificationPartnerTransientMessage **/

import action from 'mail.action.define';

/**
 * On receiving a transient message, i.e. a message which does not come
 * from a member of the channel. Usually a log message, such as one
 * generated from a command with ('/').
 */
export default action({
    name: 'MessagingNotificationHandler/_handleNotificationPartnerTransientMessage',
    id: 'mail.models.MessagingNotificationHandler.actions._handleNotificationPartnerTransientMessage',
    global: true,
    /**
     * @private
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {MessagingNotificationHandler} notificationHandler
     * @param {Object} data
     */
    func(
        { ctx, env },
        notificationHandler,
        data,
    ) {
        const convertedData = env.services.action.dispatch(
            'Message/convertData',
            data,
        );
        const lastMessageId = env.services.action.dispatch('Message/all').reduce(
            (lastMessageId, message) => Math.max(lastMessageId, message.id(ctx)),
            0,
        );
        const partnerRoot = env.services.model.messaging.partnerRoot(ctx);
        const message = env.services.action.dispatch(
            'Message/create',
            {
                ...convertedData,
                author: env.services.action.dispatch(
                    'RecordFieldCommand/link',
                    partnerRoot,
                ),
                id: lastMessageId + 0.01,
                isTransient: true,
            },
        );
        env.services.action.dispatch(
            'MessagingNotificationHandler/_notifyThreadViewsMessageReceived',
            notificationHandler,
            message,
        );
        // manually force recompute of counter
        env.services.action.dispatch(
            'Record/update',
            notificationHandler.messaging(ctx).messagingMenu(ctx),
        );
    },
});
