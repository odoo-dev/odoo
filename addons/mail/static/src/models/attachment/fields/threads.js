/** @odoo-module alias=mail.models.Attachment.fields.threads **/

import many2many from 'mail.model.field.many2many.define';

export default many2many({
    name: 'threads',
    id: 'mail.models.Attachment.fields.threads',
    global: true,
    target: 'Thread',
    inverse: 'attachments',
});
