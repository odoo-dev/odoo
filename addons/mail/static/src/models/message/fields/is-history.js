/** @odoo-module alias=mail.models.Message.fields.isHistory **/

import attr from 'mail.model.field.attr.define';

/**
 * Determine whether the message was a needaction. Useful to make it
 * present in history mailbox.
 */
export default attr({
    name: 'isHistory',
    id: 'mail.models.Message.fields.isHistory',
    global: true,
    default: false,
});
