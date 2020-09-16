/** @odoo-module alias=mail.models.User.fields.model **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'model',
    id: 'mail.models.User.fields.model',
    global: true,
    default: 'res.user',
});
