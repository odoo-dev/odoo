/** @odoo-module alias=mail.models.Messaging.fields.moderation **/

import one2one from 'mail.model.field.one2one.define';

/**
 * Mailbox Moderation.
 */
export default one2one({
    name: 'moderation',
    id: 'mail.models.Messaging.fields.moderation',
    global: true,
    target: 'Thread',
});
