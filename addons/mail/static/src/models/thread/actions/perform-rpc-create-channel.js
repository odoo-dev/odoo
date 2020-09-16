/** @odoo-module alias=mail.models.Thread.actions.performRpcCreateChannel **/

import action from 'mail.action.define';

/**
 * Performs the `channel_create` RPC on `mail.channel`.
 */
export default action({
    name: 'Thread/performRpcCreateChannel',
    id: 'mail.models.Thread.actions.performRpcCreateChannel',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {Object} param1
     * @param {string} param1.name
     * @param {string} [param1.privacy]
     * @returns {Thread} the created channel
     */
    async func(
        { env },
        {
            name,
            privacy,
        },
    ) {
        const device = env.services.model.messaging.device();
        const data = await env.services.rpc({
            model: 'mail.channel',
            method: 'channel_create',
            args: [name, privacy],
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
