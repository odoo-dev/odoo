odoo.define('sms.messaging.entity.Message', function (require) {
'use strict';

const {
    registerInstancePatchEntity,
} = require('mail.messaging.entityCore');

registerInstancePatchEntity('Message', 'sms.messaging.entity.Message', {

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @override
     */
    openResendAction() {
        if (this.message_type === 'sms') {
            this.env.do_action('sms.sms_resend_action', {
                additional_context: {
                    default_mail_message_id: this.id,
                },
            });
        } else {
            this._super(...arguments);
        }
    },
});

});
