/** @odoo-module alias=mail.models.Thread.fields.counter **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'counter',
    id: 'mail.models.Thread.fields.counter',
    global: true,
    default: 0,
});
