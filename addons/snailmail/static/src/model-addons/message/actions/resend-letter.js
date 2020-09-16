/** @odoo-module alias=snailmail.modelAddons.Message.actions.resendLetter **/

import action from 'mail.action.define';

/**
 * Retries to send the 'snailmail.letter' corresponding to this message.
 */
export default action({
    name: 'Message/resendLetter',
    id: 'snailmail.modelAddons.Message.actions.resendLetter',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {Message} message
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
                method: 'send_letter',
                args: [[message.id(ctx)]],
            }),
        );
    },
});
