/** @odoo-module alias=mail.models.Thread.actions.performRpcChannelSeen **/

import action from 'mail.action.define';

/**
 * Performs the `channel_seen` RPC on `mail.channel`.
 */
export default action({
    name: 'Thread/performRpcChannelSeen',
    id: 'mail.models.Thread.actions.performRpcChannelSeen',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {Object} param1
     * @param {integer[]} param1.ids list of id of channels
     * @param {integer[]} param1.lastMessageId
     */
    async func(
        { env },
        {
            ids,
            lastMessageId,
        },
    ) {
        return env.services.rpc({
            model: 'mail.channel',
            method: 'channel_seen',
            args: [ids],
            kwargs: {
                last_message_id: lastMessageId,
            },
        }, { shadow: true });
    },
});
