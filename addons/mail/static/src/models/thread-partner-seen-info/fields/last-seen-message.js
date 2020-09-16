/** @odoo-module alias=mail.models.ThreadPartnerSeenInfo.fields.lastSeenMessage **/

import many2one from 'mail.model.field.many2one.define';

export default many2one({
    name: 'lastSeenMessage',
    id: 'mail.models.ThreadPartnerSeenInfo.fields.lastSeenMessage',
    global: true,
    target: 'Message',
});
