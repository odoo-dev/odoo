/** @odoo-module alias=mail.models.Thread.fields.serverLastMessageId **/

import attr from 'mail.model.field.attr.define';

/**
 * Last message id considered by the server.
 *
 * Useful to compute localMessageUnreadCounter field.
 *
 * @see localMessageUnreadCounter
 */
export default attr({
    name: 'serverLastMessageId',
    id: 'mail.models.Thread.fields.serverLastMessageId',
    global: true,
    default: 0,
});
