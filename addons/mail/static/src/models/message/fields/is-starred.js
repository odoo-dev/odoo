/** @odoo-module alias=mail.models.Message.fields.isStarred **/

import attr from 'mail.model.field.attr.define';

/**
 * Determine whether the message is starred. Useful to make it present
 * in starred mailbox.
 */
export default attr({
    name: 'isStarred',
    id: 'mail.models.Message.fields.isStarred',
    global: true,
    default: false,
});
