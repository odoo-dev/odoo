/** @odoo-module alias=mail.models.MessagingNotificationHandler.actions._handleNotificationPartnerUserConnection **/

import action from 'mail.action.define';

export default action({
    name: 'MessagingNotificationHandler/_handleNotificationPartnerUserConnection',
    id: 'mail.models.MessagingNotificationHandler.actions._handleNotificationPartnerUserConnection',
    global: true,
    /**
     * @private
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {MessagingNotificationHandler} notificationHandler
     * @param {Object} param2
     * @param {string} param2.message
     * @param {integer} param2.partner_id
     * @param {string} param2.title
     */
    async func(
        { ctx, env },
        notificationHandler,
        {
            message,
            partner_id,
            title,
        },
    ) {
        // If the current user invited a new user, and the new user is
        // connecting for the first time while the current user is present
        // then open a chat for the current user with the new user.
        env.services['bus_service'].sendNotification({
            message,
            title,
            type: 'info',
        });
        const chat = await env.services.action.dispatch(
            'Record/doAsync',
            notificationHandler,
            () => env.services.action.dispatch(
                'Messaging/getChat',
                { partnerId: partner_id },
            ),
        );
        if (!chat || env.services.model.messaging.device(ctx).isMobile(ctx)) {
            return;
        }
        env.services.action.dispatch(
            'ChatWindowManager/openThread',
            env.services.model.messaging.chatWindowManager(ctx),
            chat,
        );
    },
});
