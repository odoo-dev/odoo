/** @odoo-module alias=snailmail.modelAddons.Message.actions.openMissingFieldsLetterAction **/

import action from 'mail.action.define';

/**
 * Opens the action about 'snailmail.letter' missing fields.
 */
export default action({
    name: 'Message/openMissingFieldsLetterAction',
    id: 'snailmail.modelAddons.Message.actions.openMissingFieldsLetterAction',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Message} message
     */
    async func(
        { ctx, env },
        message,
    ) {
        const letterIds = await env.services.action.dispatch(
            'Record/doAsync',
            message,
            () => env.services.rpc({
                model: 'snailmail.letter',
                method: 'search',
                args: [[['message_id', '=', message.id(ctx)]]],
            }),
        );
        env.bus.trigger('do-action', {
            action: 'snailmail.snailmail_letter_missing_required_fields_action',
            options: {
                additional_context: {
                    default_letter_id: letterIds[0],
                },
            },
        });
    },
});
