/** @odoo-module alias=mail.models.ThreadCache.fields.isLoaded **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'isLoaded',
    id: 'mail.models.ThreadCache.fields.isLoaded',
    global: true,
    default: false,
});
