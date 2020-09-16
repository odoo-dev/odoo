/** @odoo-module alias=mail.models.Thread.fields.isTemporary **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'isServerPinned',
    id: 'mail.models.Thread.fields.isTemporary',
    global: true,
    default: false,
});
