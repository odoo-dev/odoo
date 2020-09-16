/** @odoo-module alias=mail.models.Activity.fields.chainingType **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'chainingType',
    id: 'mail.models.Activity.fields.chainingType',
    global: true,
    default: 'suggest',
});
