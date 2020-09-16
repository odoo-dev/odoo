/** @odoo-module alias=mail.models.NotificationGroupManager.fields.groups **/

import one2many from 'mail.model.field.one2many.define';

export default one2many({
    name: 'groups',
    id: 'mail.models.NotificationGroupManager.fields.groups',
    global: true,
    target: 'NotificationGroup',
});
