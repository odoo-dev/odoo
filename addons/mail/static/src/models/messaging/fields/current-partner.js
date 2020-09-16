/** @odoo-module alias=mail.models.Messaging.fields.currentPartner **/

import one2one from 'mail.model.field.one2one.define';

export default one2one({
    name: 'currentPartner',
    id: 'mail.models.Messaging.fields.currentPartner',
    global: true,
    target: 'Partner',
});
