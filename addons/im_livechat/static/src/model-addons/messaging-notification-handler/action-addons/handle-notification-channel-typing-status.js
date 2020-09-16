/** @odoo-module alias=im_livechat.modelAddons._handleNotificationChannelTypingStatus **/

import actionAddon from 'mail.action.addon.define';

export default actionAddon({
    actionName: 'MessagingNotificationHandler/_handleNotificationChannelTypingStatus',
    id: 'im_livechat.modelAddons.MessagingNotificationHandler.actionAddons._handleNotificationChannelTypingStatus',
    global: true,
    /**
     * @override
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {function} param0.original
     * @param {string} channelId
     * @param {Object} data
     */
    func(
        { ctx, env, original },
        channelId,
        data,
    ) {
        const {
            partner_id,
            partner_name,
        } = data;
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
        let partnerId;
        let partnerName;
        if (
            env.services.model.messaging.publicPartners(ctx).some(
                publicPartner => publicPartner.id(ctx) === partner_id,
            )
        ) {
            // Some shenanigans that this is a typing notification
            // from public partner.
            partnerId = channel.correspondent(ctx).id(ctx);
            partnerName = channel.correspondent(ctx).name(ctx);
        } else {
            partnerId = partner_id;
            partnerName = partner_name;
        }
        original(channelId, {
            ...data,
            partner_id: partnerId,
            partner_name: partnerName,
        });
    },
});
