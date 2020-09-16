/** @odoo-module alias=mail.models.Notification.fields.partner **/

import many2one from 'mail.model.field.many2one.define';

export default many2one({
    name: 'partner',
    id: 'mail.models.Notification.fields.partner',
    global: true,
    target: 'Partner',
});
