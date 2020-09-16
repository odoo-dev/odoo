/** @odoo-module alias=mail.models.Composer.fields.suggestionDelimiter **/

import attr from 'mail.model.field.attr.define';

/**
 * Special character used to trigger different kinds of suggestions
 * such as canned responses (:), channels (#), commands (/) and partners (@)
 */
export default attr({
    name: 'suggestionDelimiter',
    id: 'mail.models.Composer.fields.suggestionDelimiter',
    global: true,
    default: "",
});
