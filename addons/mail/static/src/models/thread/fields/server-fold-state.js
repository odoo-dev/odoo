/** @odoo-module alias=mail.models.Thread.fields.serverFoldState **/

import attr from 'mail.model.field.attr.define';

/**
 * Determine the last fold state known by the server, which is the fold
 * state displayed after initialization or when the last pending
 * fold state change was confirmed by the server.
 *
 * This field should be considered read only in most situations. Only
 * the code handling fold state change from the server should typically
 * update it.
 */
export default attr({
    name: 'serverFoldState',
    id: 'mail.models.Thread.fields.serverFoldState',
    global: true,
    default: 'closed',
});
