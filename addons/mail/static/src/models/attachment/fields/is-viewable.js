/** @odoo-module alias=mail.models.Attachment.fields.isViewable **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'isViewable',
    id: 'mail.models.Attachment.fields.isViewable',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {Attachment} param0.record
     * @returns {boolean}
     */
    compute({ ctx, record }) {
        return (
            record.mediaType(ctx) === 'image' ||
            record.mediaType(ctx) === 'video' ||
            record.mimetype(ctx) === 'application/pdf' ||
            record.isTextFile(ctx)
        );
    },
});
