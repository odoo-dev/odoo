/** @odoo-module alias=mail.models.ChannelCommand **/

import model from 'mail.model.define';

export default model({
    name: 'ChannelCommand',
    id: 'mail.models.ChannelCommand',
    global: true,
    fields: [
        'mail.models.ChannelCommand.fields.channelTypes',
        'mail.models.ChannelCommand.fields.help',
        'mail.models.ChannelCommand.fields.name',
    ],
});
