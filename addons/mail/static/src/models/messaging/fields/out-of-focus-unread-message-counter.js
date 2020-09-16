/** @odoo-module alias=mail.models.Messaging.fields.outOfFocusUnreadMessageCounter **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'outOfFocusUnreadMessageCounter',
    id: 'mail.models.Messaging.fields.outOfFocusUnreadMessageCounter',
    global: true,
    default: 0,
});
