/** @odoo-module alias=mail.models.Message.actions.unstarAll **/

import action from 'mail.action.define';

/**
 * Unstar all starred messages of current user.
 */
export default action({
    name: 'Message/unstarAll',
    id: 'mail.models.Message.actions.unstarAll',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     */
    async func(
        { env },
    ) {
        await env.services.rpc({
            model: 'mail.message',
            method: 'unstar_all',
        });
    },
});
