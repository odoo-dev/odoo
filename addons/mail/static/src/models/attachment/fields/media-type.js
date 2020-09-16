/** @odoo-module alias=mail.models.Attachment.fields.mediaType **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'mediaType',
    id: 'mail.models.Attachment.fields.mediaType',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {Attachment} param0.record
     * @returns {string}
     */
    compute({ ctx, record }) {
        return (
            record.mimetype(ctx) &&
            record.mimetype(ctx).split('/').shift()
        );
    },
});
