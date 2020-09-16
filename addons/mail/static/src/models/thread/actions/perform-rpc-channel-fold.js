/** @odoo-module alias=mail.models.Thread.actions.performRpcChannelFold **/

import action from 'mail.action.define';

/**
 * Performs the `channel_fold` RPC on `mail.channel`.
 */
export default action({
    name: 'Thread/performRpcChannelFold',
    id: 'mail.models.Thread.actions.performRpcChannelFold',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {string} uuid
     * @param {string} state
     */
    async func(
        { env },
        uuid,
        state,
    ) {
        return env.services.rpc({
            model: 'mail.channel',
            method: 'channel_fold',
            kwargs: {
                state,
                uuid,
            },
        }, { shadow: true });
    },
});
