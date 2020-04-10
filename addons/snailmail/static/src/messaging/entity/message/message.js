odoo.define('snailmail.messaging.entity.Message', function (require) {
'use strict';

const { registerInstancePatchEntity } = require('mail.messaging.entityCore');

registerInstancePatchEntity('Message', 'snailmail.messaging.entity.Message', {

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
        await this.async(() => this.env.rpc({
            model: 'mail.message',
            method: 'cancel_letter',
            args: [[this.id]],
        }));
    },
    /**
     * Opens the action about 'snailmail.letter' format error.
     */
    openFormatLetterAction() {
        this.env.do_action('snailmail.snailmail_letter_format_error_action', {
            additional_context: {
                message_id: this.id,
            },
        });
    },
    /**
     * Opens the action about 'snailmail.letter' missing fields.
     */
    async openMissingFieldsLetterAction() {
        const letterIds = await this.async(() => this.env.rpc({
            model: 'snailmail.letter',
            method: 'search',
            args: [[['message_id', '=', this.id]]],
        }));
        this.env.do_action('snailmail.snailmail_letter_missing_required_fields_action', {
            additional_context: {
                letter_id: letterIds[0],
            },
        });
    },
    /**
     * Retries to send the 'snailmail.letter' corresponding to this message.
     */
    async resendLetter() {
        // the result will come from longpolling: message_notification_update
        await this.async(() => this.env.rpc({
            model: 'mail.message',
            method: 'send_letter',
            args: [[this.id]],
        }));
    },
});

});
