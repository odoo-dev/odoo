/** @odoo-module alias=mail.models.Messaging.fields.commands **/

import one2many from 'mail.model.field.one2many.define';

export default one2many({
    name: 'commands',
    id: 'mail.models.Messaging.fields.commands',
    global: true,
    target: 'ChannelCommand',
});
