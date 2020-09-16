/** @odoo-module alias=mail.models.Composer.fields.suggestedCannedResponses **/

import many2many from 'mail.model.field.many2many.define';

export default many2many({
    name: 'suggestedCannedResponses',
    id: 'mail.models.Composer.fields.suggestedCannedResponses',
    global: true,
    target: 'CannedResponse',
});
