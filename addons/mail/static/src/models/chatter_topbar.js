/** @odoo-module **/

import { registerModel } from '@mail/model/model_core';
import { attr, one } from '@mail/model/model_field';
import { clear } from '@mail/model/model_field_command';

import { sprintf } from '@web/core/utils/strings';

registerModel({
    name: 'ChatterTopbar',
    recordMethods: {
        /**
         * @private
         * @returns {string|FieldCommand}
         */
        _computeAttachmentButtonText() {
            if (!this.chatter || !this.chatter.thread) {
                return clear();
            }
            const attachments = this.chatter.thread.allAttachments;
            switch (attachments.length) {
                case 0:
                    return this.env._t("Attach files");
                case 1:
                    return this.env._t("1 file");
                case 2:
                    return this.env._t("2 files");
                default:
                    return sprintf(
                        this.env._t("%(attachmentCount)s files"),
                        { attachmentCount: attachments.length }
                    );
            }
        },
    },
    fields: {
        /**
         * Determines the label on the attachment button of the topbar.
         */
        attachmentButtonText: attr({
            compute: '_computeAttachmentButtonText',
        }),
        chatter: one('Chatter', {
            identifying: true,
            inverse: 'topbar',
        }),
    },
});
