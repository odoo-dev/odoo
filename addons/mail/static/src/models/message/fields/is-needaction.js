/** @odoo-module alias=mail.models.Message.fields.isNeedaction **/

import attr from 'mail.model.field.attr.define';

/**
 * Determine whether the message is needaction. Useful to make it
 * present in inbox mailbox and messaging menu.
 */
export default attr({
    name: 'isNeedaction',
    id: 'mail.models.Message.fields.isNeedaction',
    global: true,
    default: false,
});
