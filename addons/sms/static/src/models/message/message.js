odoo.define('sms/static/src/models/message/message.js', function (require) {
'use strict';

const {
    registerInstancePatchModel,
} = require('mail/static/src/model/model_core.js');

registerInstancePatchModel('mail.message', 'sms/static/src/models/message/message.js', {

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
