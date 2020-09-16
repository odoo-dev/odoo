/** @odoo-module alias=mail.models.ChannelCommand.fields.name **/

import attr from 'mail.model.field.attr.define';

/**
 *  The keyword to use a specific command.
 */
export default attr({
    name: 'name',
    id: 'mail.models.ChannelCommand.fields.name',
    global: true,
    isId: true,
});
