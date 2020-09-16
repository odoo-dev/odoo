/** @odoo-module alias=mail.models.Message.fields.isNotification **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'isNotification',
    id: 'mail.models.Message.fields.isNotification',
    global: true,
    default: false,
});
