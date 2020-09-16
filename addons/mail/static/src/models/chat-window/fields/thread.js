/** @odoo-module alias=mail.models.ChatWindow.fields.thread **/

import one2one from 'mail.model.field.one2one.define';

/**
 * Determines the `Thread` that should be displayed by `this`.
 * If no `Thread` is linked, `this` is considered "new message".
 */
export default one2one({
    name: 'thread',
    id: 'mail.models.ChatWindow.fields.thread',
    global: true,
    target: 'Thread',
    inverse: 'chatWindow',
});
