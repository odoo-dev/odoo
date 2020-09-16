/** @odoo-module alias=mail.models.MessageSeenIndicator **/

import model from 'mail.model.define';

export default model({
    name: 'MessageSeenIndicator',
    id: 'mail.models.MessageSeenIndicator',
    global: true,
    actions: [
        'mail.models.MessageSeenIndicator.actions.recomputeFetchedValues',
        'mail.models.MessageSeenIndicator.actions.recomputeSeenValues',
    ],
    fields: [
        'mail.models.MessageSeenIndicator.fields.channelId',
        'mail.models.MessageSeenIndicator.fields.hasEveryoneFetched',
        'mail.models.MessageSeenIndicator.fields.hasEveryoneSeen',
        'mail.models.MessageSeenIndicator.fields.hasSomeoneFetched',
        'mail.models.MessageSeenIndicator.fields.hasSomeoneSeen',
        'mail.models.MessageSeenIndicator.fields.id',
        'mail.models.MessageSeenIndicator.fields.isMessagePreviousToLastCurrentPartnerMessageSeenByEveryone',
        'mail.models.MessageSeenIndicator.fields.message',
        'mail.models.MessageSeenIndicator.fields.messageId',
        'mail.models.MessageSeenIndicator.fields.partnersThatHaveFetched',
        'mail.models.MessageSeenIndicator.fields.partnersThatHaveSeen',
        'mail.models.MessageSeenIndicator.fields.thread',
    ],
});
