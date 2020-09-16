/** @odoo-module alias=mail.models.MessagingNotificationHandler.actions._handleNotificationChannelTypingStatus **/

import action from 'mail.action.define';

export default action({
    name: 'MessagingNotificationHandler/_handleNotificationChannelTypingStatus',
    id: 'mail.models.MessagingNotificationHandler.actions._handleNotificationChannelTypingStatus',
    global: true,
    /**
     * @private
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {MessagingNotificationHandler} notificationHandler
     * @param {integer} channelId
     * @param {Object} param3
     * @param {boolean} param3.is_typing
     * @param {integer} param3.partner_id
     * @param {string} param3.partner_name
     */
    func(
        { ctx, env },
        notificationHandler,
        channelId,
        {
            is_typing,
            partner_id,
            partner_name,
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
            return;
        }
        const partner = env.services.action.dispatch(
            'Partner/insert',
            {
                id: partner_id,
                name: partner_name,
            },
        );
        if (partner === env.services.model.messaging.currentPartner(ctx)) {
            // Ignore management of current partner is typing notification.
            return;
        }
        if (is_typing) {
            if (channel.typingMembers(ctx).includes(partner)) {
                env.services.action.dispatch(
                    'Thread/refreshOtherMemberTypingMember',
                    channel,
                    partner,
                );
            } else {
                env.services.action.dispatch(
                    'Thread/registerOtherMemberTypingMember',
                    channel,
                    partner,
                );
            }
        } else {
            if (!channel.typingMembers(ctx).includes(partner)) {
                // Ignore no longer typing notifications of members that
                // are not registered as typing something.
                return;
            }
            env.services.action.dispatch(
                'Thread/unregisterOtherMemberTypingMember',
                channel,
                partner,
            );
        }
    },
});
