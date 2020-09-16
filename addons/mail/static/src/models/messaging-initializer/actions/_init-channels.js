/** @odoo-module alias=mail.models.MessagingInitializer.actions._initChannels **/

import action from 'mail.action.define';
import executeGracefully from 'mail.utils.executeGracefully';

export default action({
    name: 'MessagingInitializer/_initChannels',
    id: 'mail.models.MessagingInitializer.actions._initChannels',
    global: true,
    /**
     * @private
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {MessagingInitializer} messagingInitializer
     * @param {Object} [param2={}]
     * @param {Object[]} [param2.channel_channel=[]]
     * @param {Object[]} [param2.channel_direct_message=[]]
     * @param {Object[]} [param2.channel_private_group=[]]
     */
    async func(
        { ctx, env },
        messagingInitializer,
        {
            channel_channel = [],
            channel_direct_message = [],
            channel_private_group = [],
        } = {},
    ) {
        const channelsData = channel_channel.concat(
            channel_direct_message,
            channel_private_group,
        );
        return executeGracefully(
            channelsData.map(
                channelData =>
                    () => {
                        const convertedData = env.services.action.dispatch(
                            'Thread/convertData',
                            channelData,
                        );
                        if (!convertedData.members) {
                            // channel_info does not return all members of channel for
                            // performance reasons, but code is expecting to know at
                            // least if the current partner is member of it.
                            // (e.g. to know when to display "invited" notification)
                            // Current partner can always be assumed to be a member of
                            // channels received at init.
                            convertedData.members = env.services.action.dispatch(
                                'RecordFieldCommand/link',
                                env.services.model.messaging.currentPartner(ctx),
                            );
                        }
                        const channel = env.services.action.dispatch(
                            'Thread/insert',
                            {
                                model: 'mail.channel',
                                ...convertedData,
                            },
                        );
                        // flux specific: channels received at init have to be
                        // considered pinned. task-2284357
                        if (!channel.isPinned(ctx)) {
                            env.services.action.dispatch(
                                'Thread/pin',
                                channel,
                            );
                        }
                    },
            ),
        );
    },
});