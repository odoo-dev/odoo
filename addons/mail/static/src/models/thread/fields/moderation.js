/** @odoo-module alias=mail.models.Thread.fields.moderation **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'moderation',
    id: 'mail.models.Thread.fields.moderation',
    global: true,
    default: false,
});
