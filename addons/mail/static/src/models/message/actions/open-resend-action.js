/** @odoo-module alias=mail.models.Message.actions.openResendAction **/

import action from 'mail.action.define';

/**
 * Opens the view that allows to resend the message in case of failure.
 */
export default action({
    name: 'Message/openResendAction',
    id: 'mail.models.Message.actions.openResendAction',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Message} message
     */
    func(
        { ctx, env },
        message,
    ) {
        env.bus.trigger('do-action', {
            action: 'mail.mail_resend_message_action',
            options: {
                additional_context: {
                    mail_message_to_resend: message.id(ctx),
                },
            },
        });
    },
});
