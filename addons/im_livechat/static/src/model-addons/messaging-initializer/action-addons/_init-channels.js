/** @odoo-module alias=im_livechat.modelAddons.MessagingInitializer.actionAddons._initChannels **/

import actionAddon from 'mail.action.addon.define';
import executeGracefully from 'mail.utils.executeGracefully';

export default actionAddon({
    actionName: 'MessagingInitializer/_initChannels',
    id: 'im_livechat.modelAddons.MessagingInitializer.actionAddons._initChannels',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {function} param0.original
     * @param {MessagingInitializer} messagingInitializer
     * @param {Object[]} [param2.channel_livechat=[]]
     */
    async func(
        { ctx, env, original },
        messagingInitializer,
        initMessagingData,
    ) {
        await env.services.action.dispatch(
            'Record/doAsync',
            messagingInitializer,
            () => original(initMessagingData),
        );
        const {
            channel_livechat = [],
        } = initMessagingData;
        return executeGracefully(
            channel_livechat.map(
                data =>
                    () => {
                        const channel = env.services.action.dispatch(
                            'Thread/insert',
                            env.services.action.dispatch(
                                'Thread/convertData',
                                data,
                            ),
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
