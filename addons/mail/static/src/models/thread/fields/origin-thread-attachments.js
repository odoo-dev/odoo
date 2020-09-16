/** @odoo-module alias=mail.models.Thread.fields.originThreadAttachments **/

import one2many from 'mail.model.field.one2many.define';

export default one2many({
    name: 'originThreadAttachments',
    id: 'mail.models.Thread.fields.originThreadAttachments',
    global: true,
    target: 'Attachment',
    inverse: 'originThread',
});
