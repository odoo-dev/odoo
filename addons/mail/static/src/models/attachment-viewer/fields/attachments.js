/** @odoo-module alias=mail.models.AttachmentViewer.fields.attachments **/

import many2many from 'mail.model.field.many2many.define';

export default many2many({
    name: 'attachments',
    id: 'mail.models.AttachmentViewer.fields.attachments',
    global: true,
    target: 'Attachment',
    inverse: '$attachmentViewer',
});
