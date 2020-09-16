/** @odoo-module alias=mail.models.Message.fields.isTransient **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'isTransient',
    id: 'mail.models.Message.fields.isTransient',
    global: true,
    default: false,
});
