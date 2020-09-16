/** @odoo-module alias=mail.models.ChatWindowManager.fields.messaging **/

import one2one from 'mail.model.field.one2one.define';

export default one2one({
    name: 'messaging',
    id: 'mail.models.ChatWindowManager.fields.messaging',
    global: true,
    target: 'Messaging',
    inverse: 'chatWindowManager',
});
