/** @odoo-module alias=mail.models.ThreadView.fields.hasAutoScrollOnMessageReceived **/

import attr from 'mail.model.field.attr.define';

/**
 * Determines whether `this` should automatically scroll on receiving
 * a new message. Detection of new message is done through the component
 * hint `message-received`.
 */
export default attr({
    name: 'hasAutoScrollOnMessageReceived',
    id: 'mail.models.ThreadView.fields.hasAutoScrollOnMessageReceived',
    global: true,
    default: true,
});
