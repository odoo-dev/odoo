/** @odoo-module alias=mail.models.Thread.fields.pendingSeenMessageId **/

import attr from 'mail.model.field.attr.define';

/**
 * Determine if there is a pending seen message change, which is a change
 * of seen message requested by the client but not yet confirmed by the
 * server.
 */
export default attr({
    name: 'pendingSeenMessageId',
    id: 'mail.models.Thread.fields.pendingSeenMessageId',
    global: true,
});
