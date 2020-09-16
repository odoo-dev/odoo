/** @odoo-module alias=mail.models.Message.fields.serverChannels **/

import many2many from 'mail.model.field.many2many.define';

/**
 * All channels containing this message on the server.
 * Equivalent of python field `channel_ids`.
 */
export default many2many({
    name: 'serverChannels',
    id: 'mail.models.Message.fields.serverChannels',
    global: true,
    target: 'Thread',
    inverse: 'messagesAsServerChannel',
});
