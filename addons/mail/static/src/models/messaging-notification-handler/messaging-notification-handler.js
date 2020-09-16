/** @odoo-module alias=mail.models.MessagingNotificationHandler **/

import model from 'mail.model.define';

export default model({
    name: 'MessagingNotificationHandler',
    id: 'mail.models.MessagingNotificationHandler',
    global: true,
    actions: [
        'mail.models.MessagingNotificationHandler.actions._filterNotificationsOnUnsubscribe',
        'mail.models.MessagingNotificationHandler.actions._handleNotificationChannel',
        'mail.models.MessagingNotificationHandler.actions._handleNotificationChannelFetched',
        'mail.models.MessagingNotificationHandler.actions._handleNotificationChannelMessage',
        'mail.models.MessagingNotificationHandler.actions._handleNotificationChannelSeen',
        'mail.models.MessagingNotificationHandler.actions._handleNotificationChannelTypingStatus',
        'mail.models.MessagingNotificationHandler.actions._handleNotificationNeedaction',
        'mail.models.MessagingNotificationHandler.actions._handleNotificationPartner',
        'mail.models.MessagingNotificationHandler.actions._handleNotificationPartnerAuthor',
        'mail.models.MessagingNotificationHandler.actions._handleNotificationPartnerChanel',
        'mail.models.MessagingNotificationHandler.actions._handleNotificationPartnerDeletion',
        'mail.models.MessagingNotificationHandler.actions._handleNotificationPartnerMessageNotificationUpdate',
        'mail.models.MessagingNotificationHandler.actions._handleNotificationPartnerMarkAsRead',
        'mail.models.MessagingNotificationHandler.actions._handleNotificationPartnerModerator',
        'mail.models.MessagingNotificationHandler.actions._handleNotificationPartnerToggleStar',
        'mail.models.MessagingNotificationHandler.actions._handleNotificationPartnerTransientMessage',
        'mail.models.MessagingNotificationHandler.actions._handleNotificationPartnerUnsubscribe',
        'mail.models.MessagingNotificationHandler.actions._handleNotificationPartnerUserConnection',
        'mail.models.MessagingNotificationHandler.actions._handleNotifications',
        'mail.models.MessagingNotificationHandler.actions._notifyNewChannelMessageWhileOutOfFocus',
        'mail.models.MessagingNotificationHandler.actions._notifyThreadViewsMessageReceived',
        'mail.models.MessagingNotificationHandler.actions.start',
        'mail.models.MessagingNotificationHandler.actions.stop',
    ],
    fields: [
        'mail.models.MessagingNotificationHandler.fields.messaging',
    ],
});
