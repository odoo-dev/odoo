/** @odoo-module alias=mail.models.Attachment.fields.isUploading **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'isUploading',
    id: 'mail.models.Attachment.fields.isUploading',
    global: true,
    default: false,
});
