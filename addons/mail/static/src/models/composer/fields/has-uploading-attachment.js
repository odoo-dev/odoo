/** @odoo-module alias=mail.models.Composer.fields.hasUploadingAttachment **/

import attr from 'mail.model.field.attr.define';

/**
 * This field determines whether some attachments linked to this
 * composer are being uploaded.
 */
export default attr({
    name: 'hasUploadingAttachment',
    id: 'mail.models.Composer.fields.hasUploadingAttachment',
    global: true,
    /**
    * @param {Object} param0
    * @param {string} param0.ctx
    * @param {Composer} param0.record
    * @returns {boolean}
    */
    compute({ ctx, record }) {
        return record.attachments(ctx).some(
            attachment => attachment.isUploading(ctx),
        );
    },
});
