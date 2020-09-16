/** @odoo-module alias=mail.models.Thread.fields.chatWindow **/

import one2one from 'mail.model.field.one2one.define';

/**
 * States the `ChatWindow` related to `this`. Serves as compute
 * dependency. It is computed from the inverse relation and it should
 * otherwise be considered read-only.
 */
export default one2one({
    name: 'chatWindow',
    id: 'mail.models.Thread.fields.chatWindow',
    global: true,
    target: 'ChatWindow',
    inverse: 'thread',
});
