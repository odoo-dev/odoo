/** @odoo-module alias=mail.models.CannedResponse.fields.substitution **/

import attr from 'mail.model.field.attr.define';

/**
 * The canned response itself which will replace the keyword previously
 * entered.
 */
export default attr({
    name: 'substitution',
    id: 'mail.models.CannedResponse.fields.substitution',
    global: true,
});
