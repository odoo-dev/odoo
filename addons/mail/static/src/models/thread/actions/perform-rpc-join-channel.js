/** @odoo-module alias=mail.models.Thread.actions.performRpcJoinChannel **/

import action from 'mail.action.define';

/**
 * Performs the `channel_join_and_get_info` RPC on `mail.channel`.
 */
export default action({
    name: 'Thread/performRpcJoinChannel',
    id: 'mail.models.Thread.actions.performRpcJoinChannel',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {Object} param1
     * @param {integer} param1.channelId
     * @returns {Thread} the channel that was joined
     */
    async func(
        { env },
        { channelId },
    ) {
        const device = env.services.model.messaging.device();
        const data = await env.services.rpc({
            model: 'mail.channel',
            method: 'channel_join_and_get_info',
            args: [[channelId]],
            kwargs: {
                context: {
                    ...env.session.user_content,
                    // optimize the return value by avoiding useless queries
                    // in non-mobile devices
                    isMobile: device.isMobile(),
                },
            },
        });
        return env.services.action.dispatch(
            'Thread/insert',
            env.services.action.dispatch(
                'Thread/convertData',
                data,
            ),
        );
    },
});
