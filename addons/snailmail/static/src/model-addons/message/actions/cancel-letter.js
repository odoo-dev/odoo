/** @odoo-module alias=snailmail.modelAddons.Message.actions.cancelLetter **/

import action from 'mail.action.define';

/**
 * Cancels the 'snailmail.letter' corresponding to this message.
 */
export default action({
    name: 'Message/cancelLetter',
    id: 'snailmail.modelAddons.Message.actions.cancelLetter',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Message} message
     * @returns {Deferred}
     */
    async func(
        { ctx, env },
        message,
    ) {
        // the result will come from longpolling: message_notification_update
        await env.services.action.dispatch(
            'Record/doAsync',
            message,
            () => env.services.rpc({
                model: 'mail.message',
                method: 'cancel_letter',
                args: [[message.id(ctx)]],
            }),
        );
    },
});
