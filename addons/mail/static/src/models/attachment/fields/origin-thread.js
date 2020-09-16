/** @odoo-module alias=mail.models.Attachment.fields.originThread **/

import many2one from 'mail.model.field.many2one.define';

export default many2one({
    name: 'originThread',
    id: 'mail.models.Attachment.fields.originThread',
    global: true,
    target: 'Thread',
    inverse: 'originThreadAttachments',
});
