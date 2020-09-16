/** @odoo-module alias=mail.models.CannedResponse.fields.source **/

import attr from 'mail.model.field.attr.define';

/**
 *  The keyword to use a specific canned response.
 */
export default attr({
    name: 'source',
    id: 'mail.models.CannedResponse.fields.source',
    global: true,
});
