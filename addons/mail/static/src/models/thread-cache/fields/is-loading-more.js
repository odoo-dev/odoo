/** @odoo-module alias=mail.models.ThreadCache.fields.isLoadingMore **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'isLoadingMore',
    id: 'mail.models.ThreadCache.fields.isLoadingMore',
    global: true,
    default: false,
});
