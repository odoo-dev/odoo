/** @odoo-module alias=mail.models.Message.fields.isNote **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'isNote',
    id: 'mail.models.Message.fields.isNote',
    global: true,
    default: false,
});
