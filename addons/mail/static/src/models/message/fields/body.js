/** @odoo-module alias=mail.models.Message.fields.body **/

import attr from 'mail.model.field.attr.define';

/**
 * This value is meant to be returned by the server
 * (and has been sanitized before stored into db).
 * Do not use this value in a 't-raw' if the message has been created
 * directly from user input and not from server data as it's not escaped.
 */
export default attr({
    name: 'body',
    id: 'mail.models.Message.fields.body',
    global: true,
    default: "",
});
