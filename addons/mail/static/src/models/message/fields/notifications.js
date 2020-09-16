/** @odoo-module alias=mail.models.Message.fields.notifications **/

import one2many from 'mail.model.field.one2many.define';

export default one2many({
    name: 'notifications',
    id: 'mail.models.Message.fields.notifications',
    global: true,
    target: 'Notification',
    inverse: 'message',
    isCausal: true,
});
