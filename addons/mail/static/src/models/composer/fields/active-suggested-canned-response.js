/** @odoo-module alias=mail.models.Composer.fields.activeSuggestedCannedResponse **/

import many2one from 'mail.model.field.many2one.define';

export default many2one({
    name: 'activeSuggestedCannedResponse',
    id: 'mail.models.Composer.fields.activeSuggestedCannedResponse',
    global: true,
    target: 'CannedResponse',
});
