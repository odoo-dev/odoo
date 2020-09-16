/** @odoo-module alias=mail.models.Thread.fields.messagesAsOriginThread **/

import one2many from 'mail.model.field.one2many.define';

/**
 * All messages that have been originally posted in this thread.
 */
export default one2many({
    name: 'messagesAsOriginThread',
    id: 'mail.models.Thread.fields.messagesAsOriginThread',
    global: true,
    target: 'Message',
    inverse: 'originThread',
});
