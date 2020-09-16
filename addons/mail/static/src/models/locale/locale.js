/** @odoo-module alias=mail.models.Locale **/

import model from 'mail.model.define';

export default model({
    name: 'Locale',
    id: 'mail.models.Locale',
    global: true,
    fields: [
        'mail.models.Locale.fields.language',
        'mail.models.Locale.fields.textDirection',
    ],
});
