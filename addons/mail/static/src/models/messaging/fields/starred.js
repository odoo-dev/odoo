/** @odoo-module alias=mail.models.Messaging.fields.starred **/

import one2one from 'mail.model.field.one2one.define';

/**
 * Mailbox Starred.
 */
export default one2one({
    name: 'starred',
    id: 'mail.models.Messaging.fields.starred',
    global: true,
    target: 'Thread',
});
