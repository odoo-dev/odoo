/** @odoo-module alias=mail.models.ThreadCache.fields.isAllHistoryLoaded **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'isAllHistoryLoaded',
    id: 'mail.models.ThreadCache.fields.isAllHistoryLoaded',
    global: true,
    default: false,
});
