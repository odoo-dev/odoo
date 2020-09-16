/** @odoo-module alias=mail.models.Thread.fields.isModerator **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'isModerator',
    id: 'mail.models.Thread.fields.isModerator',
    global: true,
    default: false,
});
