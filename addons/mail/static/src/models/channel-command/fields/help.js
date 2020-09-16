/** @odoo-module alias=mail.models.ChannelCommand.fields.help **/

import attr from 'mail.model.field.attr.define';

/**
 *  The command that will be executed.
 */
export default attr({
    name: 'help',
    id: 'mail.models.ChannelCommand.fields.help',
    global: true,
});
