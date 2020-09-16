/** @odoo-module alias=mail.models.Messaging.fields.history **/

import one2one from 'mail.model.field.one2one.define';

/**
 * Mailbox History.
 */
export default one2one({
    name: 'history',
    id: 'mail.models.Messaging.fields.history',
    global: true,
    target: 'Thread',
});
