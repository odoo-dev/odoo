/** @odoo-module alias=website_livechat.modelAddons.MessagingNotificationHandler.actionAddons._handleNotificationPartner **/

import actionAddon from 'mail.action.addon.define';

export default actionAddon({
    actionName: 'MessagingNotificationHandler/_handleNotificationPartner',
    id: 'website_livechat.modelAddons.MessagingNotificationHandler.actionAddons._handleNotificationPartner',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {function} param0.original
     * @param {Object} data
     */
    func(
        { ctx, env, original },
        data,
    ) {
        const { info } = data;
        if (info === 'send_chat_request') {
            env.services.action.dispatch(
                'MessagingNotificationHandler/_handleNotificationPartnerChannel',
                data,
            );
            const channel = env.services.action.dispatch(
                'Thread/findById',
                {
                    id: data.id,
                    model: 'mail.channel',
                },
            );
            env.services.action.dispatch(
                'ChatWindowManager/openThread',
                env.services.model.messaging.chatWindowManager(ctx),
                channel,
                { makeActive: true },
            );
            return;
        }
        return original(data);
    },
});
