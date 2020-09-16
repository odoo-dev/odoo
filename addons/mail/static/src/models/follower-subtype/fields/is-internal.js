/** @odoo-module alias=mail.models.FollowerSubtype.fields.isInternal **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'isInternal',
    id: 'mail.models.FollowerSubtype.fields.isInternal',
    global: true,
    default: false,
});
