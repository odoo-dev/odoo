/** @odoo-module alias=mail.models.Message.fields.date **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'date',
    id: 'mail.models.Message.fields.date',
    global: true,
    default: moment(),
});
