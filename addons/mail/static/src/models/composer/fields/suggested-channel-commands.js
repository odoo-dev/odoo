/** @odoo-module alias=mail.models.Composer.fields.suggestedChannelCommands **/

import many2many from 'mail.model.field.many2many.define';

export default many2many({
    name: 'suggestedChannelCommands',
    id: 'mail.models.Composer.fields.suggestedChannelCommands',
    global: true,
    target: 'ChannelCommand',
});
