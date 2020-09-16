/** @odoo-module alias=mail.models.MessagingNotificationHandler.actions._handleNotificationPartnerDeletion **/

import action from 'mail.action.define';

export default action({
    name: 'MessagingNotificationHandler/_handleNotificationPartnerDeletion',
    id: 'mail.models.MessagingNotificationHandler.actions._handleNotificationPartnerDeletion',
    global: true,
    /**
     * @private
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {MessagingNotificationHandler} notificationHandler
     * @param {Object} param2
     * @param {integer[]} param2.messag_ids
     */
    func(
        { ctx, env },
        notificationHandler,
        { message_ids },
    ) {
        const moderationMailbox = env.services.model.messaging.moderation(ctx);
        for (const id of message_ids) {
            const message = env.services.action.dispatch(
                'Message/findById',
                { id },
            );
            if (message) {
                if (
                    message.moderationStatus(ctx) === 'pending_moderation' &&
                    message.originThread(ctx).isModeratedByCurrentPartner(ctx)
                ) {
                    env.services.action.dispatch(
                        'Record/update',
                        moderationMailbox,
                        {
                            counter: env.services.action.dispatch(
                                'RecordFieldCommand/decrement',
                            ),
                        },
                    );
                }
                env.services.action.dispatch(
                    'Record/delete',
                    message,
                );
            }
        }
        // deleting message might have deleted notifications, force recompute
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
