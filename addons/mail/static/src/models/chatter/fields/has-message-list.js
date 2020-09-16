/** @odoo-module alias=mail.models.Chatter.fields.hasMessageList **/

import attr from 'mail.model.fields.attr.define';

/**
 * Determines whether `this` should display a message list.
 */
export default attr({
    name: 'hasMessageList',
    id: 'mail.models.Chatter.fields.hasMessageList',
    global: true,
    default: true,
});
