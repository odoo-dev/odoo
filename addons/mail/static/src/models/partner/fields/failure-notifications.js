/** @odoo-module alias=mail.models.Partner.fields.failureNotifications **/

import one2many from 'mail.model.field.one2many.define';

export default one2many({
    name: 'failureNotifications',
    id: 'mail.models.Partner.fields.failureNotifications',
    global: true,
    target: 'Notification',
    related: 'messagesAsAuthor.failureNotifications',
});
