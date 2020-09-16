/** @odoo-module alias=mail.models.MessagingNotificationHandler.actions._handleNotificationPartnerMessageNotificationUpdate **/

import action from 'mail.action.define';

export default action({
    name: 'MessagingNotificationHandler/_handleNotificationPartnerMessageNotificationUpdate',
    id: 'mail.models.MessagingNotificationHandler.actions._handleNotificationPartnerMessageNotificationUpdate',
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
        data
    ) {
        for (const messageData of data) {
            const message = env.services.action.dispatch(
                'Message/insert',
                env.services.action.dispatch(
                    'Message/convertData',
                    messageData,
                ),
            );
            // implicit: failures are sent by the server as notification
            // only if the current partner is author of the message
            if (
                !message.author(ctx) &&
                notificationHandler.messaging(ctx).currentPartner(ctx)
            ) {
                env.services.action.dispatch(
                    'Record/update',
                    message,
                    {
                        author: env.services.action.dispatch(
                            'RecordFieldCommand/link',
                            notificationHandler.messaging(ctx).currentPartner(ctx),
                        ),
                    },
                );
            }
        }
        env.services.action.dispatch(
            'NotificationGroupManager/computeGroups',
            notificationHandler.messaging(ctx).notificationGroupManager(ctx),
        );
        // manually force recompute of counter (after computing the groups)
        env.services.action.dispatch(
            'Record/update',
            notificationHandler.messaging(ctx).messagingMenu(ctx),
        );
    },
});
