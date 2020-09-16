/** @odoo-module alias=im_livechat.modelAddons.ChatWindow.actionAddons.close **/

import actionAddon from 'mail.action.addon.define';

export default actionAddon({
    actionName: 'ChatWindow/close',
    id: 'im_livechat.modelAddons.ChatWindow.actionAddons.close',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {function} param0.original
     * @param {ChatWindow} chatWindow
     * @param {Object} param2
     * @param {boolean} [param2.notifyServer]
     */
    func(
        { ctx, env, original },
        chatWindow,
        { notifyServer } = {},
    ) {
        if (
            chatWindow.thread(ctx) &&
            chatWindow.thread(ctx).model(ctx) === 'mail.channel' &&
            chatWindow.thread(ctx).channelType(ctx) === 'livechat' &&
            chatWindow.thread(ctx).mainCache(ctx).isLoaded(ctx) &&
            chatWindow.thread(ctx).messages(ctx).length === 0
        ) {
            notifyServer = true;
            env.services.action.dispatch(
                'Thread/unpin',
                chatWindow.thread(ctx),
            );
        }
        original(chatWindow, { notifyServer });
    },
});
