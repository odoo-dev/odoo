/** @odoo-module alias=mail.models.Notification.fields.message **/

import many2one from 'mail.model.field.many2one.define';

export default many2one({
    name: 'message',
    id: 'mail.models.Notification.fields.message',
    global: true,
    target: 'Message',
    inverse: 'notifications',
});
