/** @odoo-module alias=mail.models.Thread.fields.isPendingPinned **/

import attr from 'mail.model.field.attr.define';

/**
 * Determine if there is a pending pin state change, which is a change
 * of pin state requested by the client but not yet confirmed by the
 * server.
 *
 * This field can be updated to immediately change the pin state on the
 * interface and to notify the server of the new state.
 */
export default attr({
    name: 'isPendingPinned',
    id: 'mail.models.Thread.fields.isPendingPinned',
    global: true,
});
