/** @odoo-module alias=mail.models.Messaging.fields.cannedResponses **/

import one2many from 'mail.model.field.one2many.define';

export default one2many({
    name: 'cannedResponses',
    id: 'mail.models.Messaging.fields.cannedResponses',
    global: true,
    target: 'CannedResponse',
});
