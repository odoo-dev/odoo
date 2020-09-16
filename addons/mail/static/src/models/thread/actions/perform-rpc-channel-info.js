/** @odoo-module alias=mail.models.Thread.actions.performRpcChannelInfo **/

import action from 'mail.action.define';

/**
 * Performs the `channel_info` RPC on `mail.channel`.
 */
export default action({
    name: 'Thread/performRpcChannelInfo',
    id: 'mail.models.Thread.actions.performRpcChannelInfo',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {Object} param1
     * @param {integer[]} param1.ids list of id of channels
     * @returns {Thread[]}
     */
    async func(
        { env },
        { ids },
    ) {
        const channelInfos = await env.services.rpc({
            model: 'mail.channel',
            method: 'channel_info',
            args: [ids],
        }, { shadow: true });
        const channels = env.services.action.dispatch(
            'Thread/insert',
            channelInfos.map(
                channelInfo => env.services.action.dispatch(
                    'Thread/convertData',
                    channelInfo,
                ),
            ),
        );
        // manually force recompute of counter
        env.services.action.dispatch(
            'Record/update',
            env.services.model.messaging.messagingMenu(),
        );
        return channels;
    },
});
