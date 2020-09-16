/** @odoo-module alias=mail.models.Message.fields.originThread **/

import many2one from 'mail.model.field.many2one.define';

/**
 * Origin thread of this message (if any).
 */
export default many2one({
    name: 'originThread',
    id: 'mail.models.Message.fields.originThread',
    global: true,
    target: 'Thread',
    inverse: 'messagesAsOriginThread',
});
