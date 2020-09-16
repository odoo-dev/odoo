/** @odoo-module alias=mail.models.SuggestedRecipientInfo **/

import model from 'mail.model.define';

export default model({
    name: 'SuggestedRecipientInfo',
    id: 'mail.models.SuggestedRecipientInfo',
    global: true,
    fields: [
        'mail.models.SuggestedRecipientInfo.fields.email',
        'mail.models.SuggestedRecipientInfo.fields.isSelected',
        'mail.models.SuggestedRecipientInfo.fields.name',
        'mail.models.SuggestedRecipientInfo.fields.partner',
        'mail.models.SuggestedRecipientInfo.fields.reason',
        'mail.models.SuggestedRecipientInfo.fields.thread',
    ],
});
