odoo.define('snailmail/static/src/models/message.message.js', function (require) {
'use strict';

const { registerInstancePatchModel } = require('@mail/model/model_core');

registerInstancePatchModel('mail.message', 'snailmail/static/src/models/message.message.js', {

    //----------------------------------------------------------------------
    // Public
    //----------------------------------------------------------------------

    /**
     * Cancels the 'snailmail.letter' corresponding to this message.
     *
     * @returns {Deferred}
     */
    async cancelLetter() {
        // the result will come from longpolling: message_notification_update
        await this.env.services.orm.call('mail.message', 'cancel_letter', [this.id]);
    },
    /**
     * Opens the action about 'snailmail.letter' format error.
     */
    openFormatLetterAction() {
        this.env.bus.trigger('do-action', {
            action: 'snailmail.snailmail_letter_format_error_action',
            options: {
                additional_context: {
                    message_id: this.id,
                },
            },
        });
    },
    /**
     * Opens the action about 'snailmail.letter' missing fields.
     */
    async openMissingFieldsLetterAction() {
        const letterIds = await this.env.services.orm.search('snailmail.letter', [['message_id', '=', this.id]]);
        this.env.bus.trigger('do-action', {
            action: 'snailmail.snailmail_letter_missing_required_fields_action',
            options: {
                additional_context: {
                    default_letter_id: letterIds[0],
                },
            },
        });
    },
    /**
     * Retries to send the 'snailmail.letter' corresponding to this message.
     */
    async resendLetter() {
        // the result will come from longpolling: message_notification_update
        await this.env.services.orm.call('mail.message', 'send_letter', [this.id]);
    },
});

});
