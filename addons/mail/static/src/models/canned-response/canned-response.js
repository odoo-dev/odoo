/** @odoo-module alias=mail.models.CannedResponse **/

import model from 'mail.model.define';

export default model({
    name: 'CannedResponse',
    id: 'mail.models.CannedResponse',
    global: true,
    fields: [
        'mail.models.CannedResponse.fields.id',
        'mail.models.CannedResponse.fields.source',
        'mail.models.CannedResponse.fields.substitution',
    ],
});
