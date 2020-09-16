/** @odoo-module alias=mail.models.AttachmentViewer.fields.attachment **/

import many2one from 'mail.model.field.many2one.define';

export default many2one({
    name: 'attachment',
    id: 'mail.models.AttachmentViewer.fields.attachment',
    global: true,
    target: 'Attachment',
});
