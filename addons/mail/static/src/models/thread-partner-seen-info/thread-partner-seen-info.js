/** @odoo-module alias=mail.models.ThreadPartnerSeenInfo **/

import model from 'mail.model.define';

export default model({
    name: 'ThreadPartnerSeenInfo',
    id: 'mail.models.ThreadPartnerSeenInfo',
    global: true,
    fields: [
        'mail.models.ThreadPartnerSeenInfo.fields.channelId',
        'mail.models.ThreadPartnerSeenInfo.fields.lastFetchedMessage',
        'mail.models.ThreadPartnerSeenInfo.fields.lastSeenMessage',
        'mail.models.ThreadPartnerSeenInfo.fields.partner',
        'mail.models.ThreadPartnerSeenInfo.fields.partnerId',
        'mail.models.ThreadPartnerSeenInfo.fields.thread',
    ],
});
