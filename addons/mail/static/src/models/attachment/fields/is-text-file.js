/** @odoo-module alias=mail.models.Attachment.fields.isTextFile **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'isTextFile',
    id: 'mail.models.Attachment.fields.isTextFile',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {Attachment} param0.record
     * @returns {boolean}
     */
    compute({ ctx, record }) {
        if (!record.fileType(ctx)) {
            return false;
        }
        return record.fileType(ctx).includes('text');
    },
});
