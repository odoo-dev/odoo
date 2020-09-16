/** @odoo-module alias=mail.models.MessagingNotificationHandler.actions._handleNotificationPartnerModerator **/

import action from 'mail.action.define';

export default action({
    name: 'MessagingNotificationHandler/_handleNotificationPartnerModerator',
    id: 'mail.models.MessagingNotificationHandler.actions._handleNotificationPartnerModerator',
    global: true,
    /**
     * @private
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {MessagingNotificationHandler} notificationHandler
     * @param {Object} param2
     * @param {Object} param2.message
     */
    func(
        { ctx, env },
        notificationHandler,
        { message: data },
    ) {
        env.services.action.dispatch(
            'Message/insert',
            env.services.action.dispatch(
                'Message/convertData',
                data,
            ),
        );
        const moderationMailbox = env.services.model.messaging.moderation(ctx);
        if (moderationMailbox) {
            env.services.action.dispatch(
                'Record/update',
                moderationMailbox,
                {
                    counter: env.services.action.dispatch(
                        'RecordFieldCommand/increment',
                    ),
                },
            );
        }
        // manually force recompute of counter
        env.services.action.dispatch(
            'Record/update',
            notificationHandler.messaging(ctx).messagingMenu(ctx),
        );
    },
});
