/** @odoo-module alias=mail.models.Message.fields.isDiscussion **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'isDiscussion',
    id: 'mail.models.Message.fields.isDiscussion',
    global: true,
    default: false,
});
