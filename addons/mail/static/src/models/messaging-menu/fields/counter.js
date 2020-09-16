/** @odoo-module alias=mail.models.MessagingMenu.fields.counter **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'counter',
    id: 'mail.models.MessagingMenu.fields.counter',
    global: true,
    default: 0,
});
