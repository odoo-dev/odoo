/** @odoo-module alias=mail.models.Message.fields.isTemporary **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'isTemporary',
    id: 'mail.models.Message.fields.isTemporary',
    global: true,
    default: false,
});
