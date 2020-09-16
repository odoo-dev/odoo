/** @odoo-module alias=mail.models.NotificationGroup.fields.notifications **/

import one2many from 'mail.model.field.one2many.define';

export default one2many({
    name: 'notifications',
    id: 'mail.models.NotificationGroup.fields.notifications',
    global: true,
    target: 'Notification',
});
