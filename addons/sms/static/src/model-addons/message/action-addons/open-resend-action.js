/** @odoo-module alias=sms.modelAddons.Message.actionAddons.openResendAction **/

import actionAddon from 'mail.action.addon.define';

export default actionAddon({
    actionName: 'Message/openResendAction',
    id: 'sms.modelAddons.Message',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {function} param0.original
     * @param {Message} message
     */
    func(
        { ctx, env, original },
        message,
    ) {
        if (message.type(ctx) === 'sms') {
            env.bus.trigger('do-action', {
                action: 'sms.sms_resend_action',
                options: {
                    additional_context: {
                        default_mail_message_id: message.id(ctx),
                    },
                },
            });
        } else {
            original(...arguments);
        }
    },
});
