/** @odoo-module alias=mail.models.Partner **/

import model from 'mail.model.define';

export default model({
    name: 'Partner',
    id: 'mail.models.Partner',
    global: true,
    actions: [
        'mail.models.Partner.actions._fetchImStatus',
        'mail.models.Partner.actions._loopFetchImStatus',
        'mail.models.Partner.actions.checkIsUser',
        'mail.models.Partner.actions.convertData',
        'mail.models.Partner.actions.getChat',
        'mail.models.Partner.actions.imSearch',
        'mail.models.Partner.actions.openChat',
        'mail.models.Partner.actions.openProfile',
        'mail.models.Partner.actions.startLoopFetchImStatus',
    ],
    fields: [
        'mail.models.Partner.fields.active',
        'mail.models.Partner.fields.avatarUrl',
        'mail.models.Partner.fields.correspondentThreads',
        'mail.models.Partner.fields.country',
        'mail.models.Partner.fields.displayName',
        'mail.models.Partner.fields.email',
        'mail.models.Partner.fields.failureNotifications',
        'mail.models.Partner.fields.hasCheckedUser',
        'mail.models.Partner.fields.id',
        'mail.models.Partner.fields.imStatus',
        'mail.models.Partner.fields.memberThreads',
        'mail.models.Partner.fields.messagesAsAuthor',
        'mail.models.Partner.fields.messaging',
        'mail.models.Partner.fields.model',
        'mail.models.Partner.fields.moderatedChannels',
        'mail.models.Partner.fields.name',
        'mail.models.Partner.fields.nameOrDisplayName',
        'mail.models.Partner.fields.user',
    ],
});
