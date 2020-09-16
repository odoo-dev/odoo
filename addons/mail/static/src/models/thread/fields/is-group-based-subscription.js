/** @odoo-module alias=mail.models.Thread.fields.isGroupBasedSubscription **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'isGroupBasedSubscription',
    id: 'mail.models.Thread.fields.isGroupBasedSubscription',
    global: true,
    default: false,
});
