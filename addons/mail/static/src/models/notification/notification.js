/** @odoo-module alias=mail.models.Notification **/

import model from 'mail.model.define';

export default model({
    name: 'Notification',
    id: 'mail.models.Notification',
    global: true,
    actions: [
        'mail.models.Notification.actions.convertData',
    ],
    fields: [
        'mail.models.Notification.fields.failureType',
        'mail.models.Notification.fields.id',
        'mail.models.Notification.fields.message',
        'mail.models.Notification.fields.partner',
        'mail.models.Notification.fields.status',
        'mail.models.Notification.fields.type',
    ],
});
