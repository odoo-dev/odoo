/** @odoo-module alias=mail.models.ChannelCommand.fields.channelTypes **/

import attr from 'mail.model.field.attr.define';

/**
 * Determines on which channel types `this` is available.
 * Type of the channel (e.g. 'chat', 'channel' or 'groups')
 * This field should contain an array when filtering is desired.
 * Otherwise, it should be undefined when all types are allowed.
 */
export default attr({
    name: 'channelTypes',
    id: 'mail.models.ChannelCommand.fields.channelTypes',
    global: true,
});
