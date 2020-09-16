/** @odoo-module alias=mail.models.MessagingNotificationHandler.actions._handleNotificationPartnerChanel **/

import action from 'mail.action.define';

export default action({
    name: 'MessagingNotificationHandler/_handleNotificationPartnerChanel',
    id: 'mail.models.MessagingNotificationHandler.actions._handleNotificationPartnerChanel',
    global: true,
    /**
     * @private
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {MessagingNotificationHandler} notificationHandler
     * @param {Object} data
     * @param {string} data.channel_type
     * @param {integer} data.id
     * @param {string} [data.info]
     * @param {boolean} data.is_minimized
     * @param {string} data.name
     * @param {string} data.state
     * @param {string} data.uuid
     */
    'MessagingNotificationHandler/_handleNotificationPartnerChannel'(
        { ctx, env },
        notificationHandler,
        data,
    ) {
        const convertedData = env.services.action.dispatch(
            'Thread/convertData',
            {
                model: 'mail.channel',
                ...data,
            },
        );
        if (!convertedData.members) {
            // channel_info does not return all members of channel for
            // performance reasons, but code is expecting to know at
            // least if the current partner is member of it.
            // (e.g. to know when to display "invited" notification)
            // Current partner can always be assumed to be a member of
            // channels received through this notification.
            convertedData.members = env.services.action.dispatch(
                'RecordFieldCommand/link',
                env.services.model.messaging.currentPartner(ctx),
            );
        }
        let channel = env.services.action.dispatch(
            'Thread/findById',
            convertedData,
        );
        const wasCurrentPartnerMember = (
            channel &&
            channel.members(ctx).includes(
                env.services.model.messaging.currentPartner(ctx),
            )
        );

        channel = env.services.action.dispatch(
            'Thread/insert',
            convertedData,
        );
        if (
            channel.channelType(ctx) === 'channel' &&
            data.info !== 'creation' &&
            !wasCurrentPartnerMember
        ) {
            env.services['notification'].notify({
                message: _.str.sprintf(
                    env._t("You have been invited to: %s"),
                    owl.utils.escape(channel.name(ctx)),
                ),
                type: 'info',
            });
        }
        // a new thread with unread messages could have been added
        // manually force recompute of counter
        env.services.action.dispatch(
            'Record/update',
            notificationHandler.messaging(ctx).messagingMenu(ctx),
        );
    },
});
