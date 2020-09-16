/** @odoo-module alias=mail.models.Composer.fields.activeSuggestedChannelCommand **/

import many2one from 'mail.model.field.many2one.define';

export default many2one({
    name: 'activeSuggestedChannelCommand',
    id: 'mail.models.Composer.fields.activeSuggestedChannelCommand',
    global: true,
    target: 'ChannelCommand',
});
