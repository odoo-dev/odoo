/** @odoo-module alias=mail.models.Thread.fields.messagesAsServerChannel **/

import many2many from 'mail.model.field.many2many.define';

/**
 * All messages that are contained on this channel on the server.
 * Equivalent to the inverse of python field `channel_ids`.
 */
export default many2many({
    name: 'messagesAsServerChannel',
    id: 'mail.models.Thread.fields.messagesAsServerChannel',
    global: true,
    target: 'Message',
    inverse: 'serverChannels',
});
