/** @odoo-module alias=mail.models.Composer.fields.mainSuggestedPartners **/

import many2many from 'mail.model.field.many2many.define';

export default many2many({
    name: 'mainSuggestedPartners',
    id: 'mail.models.Composer.fields.mainSuggestedPartners',
    global: true,
    target: 'Partner',
});
