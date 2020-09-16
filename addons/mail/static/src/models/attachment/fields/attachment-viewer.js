/** @odoo-module alias=mail.models.Attachment.fields.attachmentViewer **/

import many2many from 'mail.model.field.many2many.define';

export default many2many({
    name: 'attachmentViewer',
    id: 'mail.models.Attachment.fields.attachmentViewer',
    global: true,
    target: 'AttachmentViewer',
    inverse: 'attachments',
});
