/** @odoo-module alias=mail.models.Thread.fields.messages **/

import many2many from 'mail.model.field.many2many.define';

/**
 * All messages that this thread is linked to.
 * Note that this field is automatically computed by inverse
 * computed field.
 */
export default many2many({
    name: 'messages',
    id: 'mail.models.Thread.fields.messages',
    global: true,
    target: 'Message',
    inverse: 'threads',
});
