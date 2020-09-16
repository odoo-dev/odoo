/** @odoo-module alias=mail.models.ChatWindow.fields.isDoFocus **/

import attr from 'mail.model.field.attr.define';

/**
 * Determine whether the chat window should be programmatically
 * focused by observed component of chat window. Those components
 * are responsible to unmark this record afterwards, otherwise
 * any re-render will programmatically set focus again!
 */
export default attr({
    name: 'isDoFocus',
    id: 'mail.models.ChatWindow.fields.isDoFocus',
    global: true,
    default: false,
});
