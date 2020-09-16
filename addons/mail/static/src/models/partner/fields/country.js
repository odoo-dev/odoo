/** @odoo-module alias=mail.models.Partner.fields.country **/

import many2one from 'mail.model.field.many2one.define';

export default many2one({
    name: 'country',
    id: 'mail.models.Partner.fields.country',
    global: true,
    target: 'Country',
});
