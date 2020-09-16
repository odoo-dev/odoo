/** @odoo-module alias=mail.models.Messaging.fields.partnerRoot **/

import many2one from 'mail.model.field.many2one.define';

export default many2one({
    name: 'partnerRoot',
    id: 'mail.models.Messaging.fields.partnerRoot',
    global: true,
    target: 'Partner',
});
