/** @odoo-module alias=mail.models.Thread.fields.isMassMailing **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'isMassMailing',
    id: 'mail.models.Thread.fields.isMassMailing',
    global: true,
    default: false,
});
