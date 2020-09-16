/** @odoo-module alias=mail.models.AttachmentViewer **/

import model from 'mail.model.define';

export default model({
    name: 'AttachmentViewer',
    id: 'mail.models.AttachmentViewer',
    global: true,
    actions: [
        'mail.models.AttachmentViewer.actions.close',
    ],
    fields: [
        'mail.models.AttachmentViewer.fields.angle',
        'mail.models.AttachmentViewer.fields.attachment',
        'mail.models.AttachmentViewer.fields.attachments',
        'mail.models.AttachmentViewer.fields.isImageLoading',
        'mail.models.AttachmentViewer.fields.scale',
    ],
});
