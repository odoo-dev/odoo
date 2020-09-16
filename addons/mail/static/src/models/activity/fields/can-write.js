/** @odoo-module alias=mail.models.Activity.fields.canWrite **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'canWrite',
    id: 'mail.models.Activity.fields.canWrite',
    global: true,
    default: false,
});
