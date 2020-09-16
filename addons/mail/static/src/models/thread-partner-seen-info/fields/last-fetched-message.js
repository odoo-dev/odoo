/** @odoo-module alias=mail.models.ThreadPartnerSeenInfo.fields.lastFetchedMessage **/

import many2one from 'mail.model.field.many2one.define';

export default many2one({
    name: 'lastFetchedMessage',
    id: 'mail.models.ThreadPartnerSeenInfo.fields.lastFetchedMessage',
    global: true,
    target: 'Message',
});
