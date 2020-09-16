/** @odoo-module alias=mail.models.Thread.actions.performRpcCreateChat **/

import action from 'mail.action.define';

/**
 * Performs the `channel_get` RPC on `mail.channel`.
 *
 * `openChat` is preferable in business code because it will avoid the
 * RPC if the chat already exists.
 */
export default action({
    name: 'Thread/performRpcCreateChat',
    id: 'mail.models.Thread.actions.performRpcCreateChat',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {Object} param1
     * @param {integer[]} param1.partnerIds
     * @param {boolean} [param1.pinForCurrentPartner]
     * @returns {Thread|undefined} the created or existing chat
     */
    async func(
        { env },
        {
            partnerIds,
            pinForCurrentPartner,
        },
    ) {
        const device = env.services.model.messaging.device();
        // TODO FIX: potential duplicate chat task-2276490
        const data = await env.services.rpc({
            model: 'mail.channel',
            method: 'channel_get',
            kwargs: {
                context: {
                    ...env.session.user_content,
                    // optimize the return value by avoiding useless queries
                    // in non-mobile devices
                    isMobile: device.isMobile(),
                },
                partners_to: partnerIds,
                pin: pinForCurrentPartner,
            },
        });
        if (!data) {
            return;
        }
        return env.services.action.dispatch(
            'Thread/insert',
            env.services.action.dispatch(
                'Thread/convertData',
                data,
            ),
        );
    },
});
