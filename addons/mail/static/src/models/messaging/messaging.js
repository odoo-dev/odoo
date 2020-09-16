/** @odoo-module alias=mail.models.Messaging **/

import model from 'mail.model.define';

export default model({
    name: 'Messaging',
    id: 'mail.models.Messaging',
    global: true,
    actions: [
        'mail.models.Messaging.actions._handleGlobalWindowFocus',
        'mail.models.Messaging.actions.getChat',
        'mail.models.Messaging.actions.isNotificationPermissionDefault',
        'mail.models.Messaging.actions.openChat',
        'mail.models.Messaging.actions.openDocument',
        'mail.models.Messaging.actions.openProfile',
        'mail.models.Messaging.actions.start',
        'mail.models.Messaging.actions.stop',
    ],
    fields: [
        'mail.models.Messaging.fields.cannedResponses',
        'mail.models.Messaging.fields.chatWindowManager',
        'mail.models.Messaging.fields.commands',
        'mail.models.Messaging.fields.currentPartner',
        'mail.models.Messaging.fields.currentUser',
        'mail.models.Messaging.fields.device',
        'mail.models.Messaging.fields.dialogManager',
        'mail.models.Messaging.fields.discuss',
        'mail.models.Messaging.fields.history',
        'mail.models.Messaging.fields.inbox',
        'mail.models.Messaging.fields.initializer',
        'mail.models.Messaging.fields.isInitialized',
        'mail.models.Messaging.fields.locale',
        'mail.models.Messaging.fields.messagingMenu',
        'mail.models.Messaging.fields.moderation',
        'mail.models.Messaging.fields.notificationGroupManager',
        'mail.models.Messaging.fields.notificationHandler',
        'mail.models.Messaging.fields.outOfFocusUnreadMessageCounter',
        'mail.models.Messaging.fields.partnerRoot',
        'mail.models.Messaging.fields.publicPartners',
        'mail.models.Messaging.fields.starred',
    ],
});
