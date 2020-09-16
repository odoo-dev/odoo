/** @odoo-module alias=mail.models.MessagingNotificationHandler.actions._handleNotificationPartnerUnsubscribe **/

import action from 'mail.action.define';

export default action({
    name: 'MessagingNotificationHandler/_handleNotificationPartnerUnsubscribe',
    id: 'mail.models.MessagingNotificationHandler.actions._handleNotificationPartnerUnsubscribe',
    global: true,
    /**
     * @private
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {MessagingNotificationHandler} notificationHandler
     * @param {integer} channelId
     */
    func(
        { ctx, env },
        notificationHandler,
        channelId,
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
        let message;
        if (channel.correspondent(ctx)) {
            const correspondent = channel.correspondent(ctx);
            message = _.str.sprintf(
                env._t("You unpinned your conversation with <b>%s</b>."),
                owl.utils.escape(correspondent.name(ctx)),
            );
        } else {
            message = _.str.sprintf(
                env._t("You unsubscribed from <b>%s</b>."),
                owl.utils.escape(channel.name(ctx)),
            );
        }
        // We assume that arriving here the server has effectively
        // unpinned the channel
        env.services.action.dispatch(
            'Record/update',
            channel,
            { isServerPinned: false },
        );
        env.services['notification'].notify({
            message,
            type: 'info',
        });
    },
});
