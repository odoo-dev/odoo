/** @odoo-module alias=mail.models.ChatWindow.fields.manager **/

import many2one from 'mail.model.field.many2one.define';

export default many2one({
    name: 'manager',
    id: 'mail.models.ChatWindow.fields.manager',
    global: true,
    target: 'ChatWindowManager',
    inverse: 'chatWindows',
});
