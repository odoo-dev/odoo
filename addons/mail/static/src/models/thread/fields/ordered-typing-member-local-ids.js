/** @odoo-module alias=mail.models.Thread.fields.orderedTypingMemberLocalIds **/

import attr from 'mail.model.field.attr.define';

/**
 * Technical attribute to manage ordered list of typing members.
 */
export default attr({
    name: 'orderedTypingMemberLocalIds',
    id: 'mail.models.Thread.fields.orderedTypingMemberLocalIds',
    global: true,
    default: [],
});
