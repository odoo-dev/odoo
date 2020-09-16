/** @odoo-module alias=mail.models.Attachment.fields.activities **/

import many2many from 'mail.model.field.many2many.define';

export default many2many({
    name: 'activities',
    id: 'mail.models.Attachment.fields.activities',
    global: true,
    target: 'Activity',
    inverse: 'attachments',
});
