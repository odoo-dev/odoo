/** @odoo-module alias=mail.models.ChatWindowManager.fields.chatWindows **/

import one2many from 'mail.model.field.one2many.define';

export default one2many({
    name: 'chatWindows',
    id: 'mail.models.ChatWindowManager.fields.chatWindows',
    global: true,
    target: 'ChatWindow',
    inverse: 'manager',
    isCausal: true,
});
