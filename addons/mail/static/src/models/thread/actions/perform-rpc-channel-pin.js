/** @odoo-module alias=mail.models.Thread.actions.performRpcChannelPin **/

import action from 'mail.action.define';

/**
 * Performs the `channel_pin` RPC on `mail.channel`.
 */
export default action({
    name: 'Thread/performRpcChannelPin',
    id: 'mail.models.Thread.actions.performRpcChannelPin',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {Object} param1
     * @param {boolean} [param1.pinned=false]
     * @param {string} param1.uuid
     */
    async func(
        { env },
        {
            pinned = false,
            uuid,
        },
    ) {
        return env.services.rpc({
            model: 'mail.channel',
            method: 'channel_pin',
            kwargs: {
                uuid,
                pinned,
            },
        }, { shadow: true });
    },
});
