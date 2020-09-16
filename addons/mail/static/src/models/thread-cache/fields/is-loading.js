/** @odoo-module alias=mail.models.ThreadCache.fields.isLoading **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'isLoading',
    id: 'mail.models.ThreadCache.fields.isLoading',
    global: true,
    default: false,
});
