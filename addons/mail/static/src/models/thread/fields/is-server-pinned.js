/** @odoo-module alias=mail.models.Thread.fields.isServerPinned **/

import attr from 'mail.model.field.attr.define';

/**
 * Determine the last pin state known by the server, which is the pin
 * state displayed after initialization or when the last pending
 * pin state change was confirmed by the server.
 *
 * This field should be considered read only in most situations. Only
 * the code handling pin state change from the server should typically
 * update it.
 */
export default attr({
    name: 'isServerPinned',
    id: 'mail.models.Thread.fields.isServerPinned',
    global: true,
    default: false,
});
