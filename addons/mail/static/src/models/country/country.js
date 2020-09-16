/** @odoo-module alias=mail.models.Country **/

import model from 'mail.model.define';

export default model({
    name: 'Country',
    id: 'mail.models.Country',
    global: true,
    fields: [
        'mail.models.Country.fields.code',
        'mail.models.Country.fields.flagUrl',
        'mail.models.Country.fields.id',
        'mail.models.Country.fields.name',
    ],
});
