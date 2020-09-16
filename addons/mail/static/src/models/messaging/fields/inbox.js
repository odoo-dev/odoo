/** @odoo-module alias=mail.models.Messaging.fields.inbox **/

import one2one from 'mail.model.field.one2one.define';

/**
 * Mailbox Inbox.
 */
export default one2one({
    name: 'inbox',
    id: 'mail.models.Messaging.fields.inbox',
    global: true,
    target: 'Thread',
});
