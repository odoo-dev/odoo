/** @odoo-module alias=mail.models.MessagingNotificationHandler.actions._handleNotificationNeedaction **/

import action from 'mail.action.define';

export default action({
    name: 'MessagingNotificationHandler/_handleNotificationNeedaction',
    id: 'mail.models.MessagingNotificationHandler.actions._handleNotificationNeedaction',
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
        const message = env.services.action.dispatch(
            'Message/insert',
            env.services.action.dispatch(
                'Message/convertData',
                data,
            ),
        );
        env.services.action.dispatch(
            'Record/update',
            env.services.model.messaging.inbox(ctx),
            {
                counter: env.services.action.dispatch(
                    'RecordFieldCommand/increment',
                ),
            },
        );
        const originThread = message.originThread(ctx);
        if (originThread && message.isNeedaction(ctx)) {
            env.services.action.dispatch(
                'Record/update',
                originThread,
                {
                    messageNeedactionCounter: env.services.action.dispatch(
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
