/** @odoo-module alias=mail.models.MessagingNotificationHandler **/

import one2one from 'mail.model.field.one2one.define';

export default one2one({
    name: 'messaging',
    id: 'mail.models.MessagingNotificationHandler.fields.messaging',
    global: true,
    target: 'Messaging',
    inverse: 'notificationHandler',
});
