/** @odoo-module alias=mail.models.Composer.fields.activeSuggestedPartner **/

import many2one from 'mail.model.field.many2one.define';

export default many2one({
    name: 'activeSuggestedPartner',
    id: 'mail.models.Composer.fields.activeSuggestedPartner',
    global: true,
    target: 'Partner',
});
