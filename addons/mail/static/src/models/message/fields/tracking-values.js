/** @odoo-module alias=mail.models.Message.fields.trackingValues **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'trackingValues',
    id: 'mail.models.Message.fields.trackingValues',
    global: true,
    default: [],
});
