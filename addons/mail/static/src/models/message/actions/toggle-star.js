/** @odoo-module alias=mail.models.Message.actions.toggleStar **/

import action from 'mail.action.define';

/**
 * Toggle the starred status of the provided message.
 */
export default action({
    name: 'Message/toggleStar',
    id: 'mail.models.Message.actions.toggleStar',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Message} message
     */
    async func(
        { ctx, env },
        message
    ) {
        await env.services.action.dispatch(
            'Record/doAsync',
            message,
            () => env.services.rpc({
                model: 'mail.message',
                method: 'toggle_message_starred',
                args: [[message.id(ctx)]],
            }),
        );
    },
});
