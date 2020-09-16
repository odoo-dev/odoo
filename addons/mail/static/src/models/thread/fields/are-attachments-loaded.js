/** @odoo-module alias=mail.models.Thread.fields.areAttachmentsLoaded **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'areAttachmentsLoaded',
    id: 'mail.models.Thread.fields.areAttachmentsLoaded',
    global: true,
    default: false,
});
