/** @odoo-module alias=mail.models.Partner.fields.model **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'model',
    id: 'mail.models.Partner.fields.model',
    global: true,
    default: 'res.partner',
});
