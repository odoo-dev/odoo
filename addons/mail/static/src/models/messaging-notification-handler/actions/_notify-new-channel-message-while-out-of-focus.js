/** @odoo-module alias=mail.models.MessagingNotificationHandler.actions._notifyNewChannelMessageWhileOutOfFocus **/

import action from 'mail.action.define';
import htmlToTextContentInline from 'mail.utils.htmlToTextContentInline';

const PREVIEW_MSG_MAX_SIZE = 350; // optimal for native English speakers

export default action({
    name: 'MessagingNotificationHandler/_notifyNewChannelMessageWhileOutOfFocus',
    id: 'mail.models.MessagingNotificationHandler.actions._notifyNewChannelMessageWhileOutOfFocus',
    global: true,
    /**
     * @private
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {MessagingNotificationHandler} notificationHandler
     * @param {Object} param2
     * @param {Thread} param2.channel
     * @param {Message} param2.message
     */
    func(
        { ctx, env },
        notificationHandler,
        {
            channel,
            message,
        },
    ) {
        const author = message.author(ctx);
        const messaging = env.services.model.messaging;
        let notificationTitle;
        if (!author) {
            notificationTitle = env._t("New message");
        } else {
            const escapedAuthorName = owl.utils.escape(
                author.nameOrDisplayName(ctx),
            );
            if (channel.channelType(ctx) === 'channel') {
                // hack: notification template does not support OWL components,
                // so we simply use their template to make HTML as if it comes
                // from component
                const channelIcon = env.qweb.renderToString(
                    'mail.ThreadIcon',
                    {
                        env,
                        thread: channel,
                    },
                );
                const channelName = owl.utils.escape(channel.displayName(ctx));
                const channelNameWithIcon = channelIcon + channelName;
                notificationTitle = _.str.sprintf(
                    env._t("%s from %s"),
                    escapedAuthorName,
                    channelNameWithIcon,
                );
            } else {
                notificationTitle = escapedAuthorName;
            }
        }
        const notificationContent = htmlToTextContentInline(
            message.body(ctx),
        ).substr(0, PREVIEW_MSG_MAX_SIZE);
        env.services['bus_service'].sendNotification({
            message: notificationContent,
            title: notificationTitle,
            type: 'info',
        });
        env.services.action.dispatch(
            'Record/update',
            messaging,
            {
                outOfFocusUnreadMessageCounter: env.services.action.dispatch(
                    'RecordFieldCommand/increment',
                ),
            },
        );
        const titlePattern = messaging.outOfFocusUnreadMessageCounter(ctx) === 1
            ? env._t("%d Message")
            : env._t("%d Messages");
        env.bus.trigger(
            'set_title_part',
            {
                part: '_chat',
                title: _.str.sprintf(
                    titlePattern,
                    messaging.outOfFocusUnreadMessageCounter(ctx),
                ),
            },
        );
    },
});
