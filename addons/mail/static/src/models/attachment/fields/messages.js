/** @odoo-module alias=mail.models.Attachment.fields.messages **/

import many2many from 'mail.model.field.many2many.define';

export default many2many({
    name: 'messages',
    id: 'mail.models.Attachment.fields.messages',
    global: true,
    target: 'Message',
    inverse: 'attachments',
});
