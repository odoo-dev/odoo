/** @odoo-module alias=snailmail.modelAddons.Message.actions.openFormatLetterAction **/

import action from 'mail.action.define';

/**
 * Opens the action about 'snailmail.letter' format error.
 */
export default action({
    name: 'Message/openFormatLetterAction',
    id: 'snailmail.modelAddons.Message.actions.openFormatLetterAction',
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
            action: 'snailmail.snailmail_letter_format_error_action',
            options: {
                additional_context: {
                    message_id: message.id(ctx),
                },
            },
        });
    },
});
