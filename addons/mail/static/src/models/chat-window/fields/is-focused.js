/** @odoo-module alias=mail.models.ChatWindow.fields.isFocused **/

import attr from 'mail.model.field.attr.define';

/**
 * States whether `this` is focused. Useful for visual clue.
 */
export default attr({
    name: 'isFocused',
    id: 'mail.models.ChatWindow.fields.isFocused',
    global: true,
    default: false,
});
