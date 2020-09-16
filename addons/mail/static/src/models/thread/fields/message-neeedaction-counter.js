/** @odoo-module alias=mail.models.Thread.fields.messageNeedactionCounter **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'messageNeedactionCounter',
    id: 'mail.models.Thread.fields.messageNeedactionCounter',
    global: true,
    default: 0,
});
