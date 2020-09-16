/** @odoo-module alias=mail.models.MessagingInitializer **/

import model from 'mail.model.define';

export default model({
    name: 'MessagingInitializer',
    id: 'mail.models.MessagingInitializer',
    global: true,
    actions: [
        'mail.models.MessagingInitializer.actions._init',
        'mail.models.MessagingInitializer.actions._initCannedResponses',
        'mail.models.MessagingInitializer.actions._initChannels',
        'mail.models.MessagingInitializer.actions._initCommands',
        'mail.models.MessagingInitializer.actions._initMailboxes',
        'mail.models.MessagingInitializer.actions._initMailFailures',
        'mail.models.MessagingInitializer.actions._initMentionPartnerSuggestions',
        'mail.models.MessagingInitializer.actions._initPartners',
        'mail.models.MessagingInitializer.actions.start',
        'mail.models.MessagingInitializer.actions.stop',
    ],
    fields: [
        'mail.models.MessagingInitializer.fields.messaging',
    ],
});
