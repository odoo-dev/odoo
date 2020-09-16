/** @odoo-module alias=mail.models.MessagingNotificationHandler.actions._handleNotificationPartnerToggleStar **/

import action from 'mail.action.define';

export default action({
    name: 'MessagingNotificationHandler/_handleNotificationPartnerToggleStar',
    id: 'mail.models.MessagingNotificationHandler.actions._handleNotificationPartnerToggleStar',
    global: true,
    /**
     * @private
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {MessagingNotificationHandler} notificationHandler
     * @param {Object} param2
     * @param {integer[]} param2.message_ids
     * @param {boolean} param2.starred
     */
    func(
        { ctx, env },
        notificationHandler,
        {
            message_ids = [],
            starred,
        },
    ) {
        const starredMailbox = env.services.model.messaging.starred(ctx);
        for (const messageId of message_ids) {
            const message = env.services.action.dispatch(
                'Message/findById',
                { id: messageId },
            );
            if (!message) {
                continue;
            }
            env.services.action.dispatch(
                'Record/update',
                message,
                { isStarred: starred },
            );
            env.services.action.dispatch(
                'Record/update',
                starredMailbox,
                {
                    counter: starred
                        ? env.services.action.dispatch(
                            'RecordFieldCommand/increment',
                        )
                        : env.services.action.dispatch(
                            'RecordFieldCommand/decrement',
                        ),
                },
            );
        }
    },
});
