/** @odoo-module alias=mail.models.ThreadViewer.fields.chatWindow **/

import one2one from 'mail.model.field.one2one.define';

/**
 * States the `ChatWindow` managing `this`. This field is computed
 * through the inverse relation and should be considered read-only.
 */
export default one2one({
    name: 'chatWindow',
    id: 'mail.models.ThreadViewer.fields.chatWindow',
    global: true,
    target: 'ChatWindow',
    inverse: 'threadViewer',
});
