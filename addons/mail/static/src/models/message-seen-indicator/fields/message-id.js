/** @odoo-module alias=mail.models.MessageSeenIndicator.fields.messageId **/

import attr from 'mail.model.field.attr.define';

/**
 * The id of the message this seen indicator is related to.
 *
 * Should write on this field to set relation between the channel and
 * this seen indicator, not on `message`.
 *
 * Reason for not setting the relation directly is the necessity to
 * uniquely identify a seen indicator based on channel and message from data.
 * Relational data are list of commands, which is problematic to deduce
 * identifying records.
 *
 * TODO: task-2322536 (normalize relational data) & task-2323665
 * (required fields) should improve and let us just use the relational
 * fields.
 */
export default attr({
    name: 'messageId',
    id: 'mail.models.MessageSeenIndicator.fields.messageId',
    global: true,
    isId: true,
});
