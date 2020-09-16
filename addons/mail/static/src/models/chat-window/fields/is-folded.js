/** @odoo-module alias=mail.models.ChatWindow.fields.isFolded **/

import attr from 'mail.model.field.attr.define';

/**
 * Determines whether `this` is folded.
 */
export default attr({
    name: 'isFolded',
    id: 'mail.models.ChatWindow.fields.isFolded',
    global: true,
    default: false,
});
