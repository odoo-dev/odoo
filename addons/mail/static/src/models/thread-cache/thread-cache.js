/** @odoo-module alias=mail.models.ThreadCache **/

import model from 'mail.model.define';

export default model({
    name: 'ThreadCache',
    id: 'mail.models.ThreadCache',
    global: true,
    actions: [
        'mail.models.ThreadCache.actions._extendMessageDomain',
        'mail.models.ThreadCache.actions._loadMessages',
        'mail.models.ThreadCache.actions.loadMoreMessages',
        'mail.models.ThreadCache.actions.loadNewMessages',
    ],
    fields: [
        'mail.models.ThreadCache.fields.checkedMessages',
        'mail.models.ThreadCache.fields.fetchedMessages',
        'mail.models.ThreadCache.fields.hasLoadingFailed',
        'mail.models.ThreadCache.fields.hasToLoadMessages',
        'mail.models.ThreadCache.fields.isAllHistoryLoaded',
        'mail.models.ThreadCache.fields.isCacheRefreshRequested',
        'mail.models.ThreadCache.fields.isLoaded',
        'mail.models.ThreadCache.fields.isLoading',
        'mail.models.ThreadCache.fields.isLoadingMore',
        'mail.models.ThreadCache.fields.isMarkAllAsReadRequested',
        'mail.models.ThreadCache.fields.lastFetchedMessage',
        'mail.models.ThreadCache.fields.lastMessage',
        'mail.models.ThreadCache.fields.messages',
        'mail.models.ThreadCache.fields.nonEmptyMessages',
        'mail.models.ThreadCache.fields.onChangeMarkAllAsRead',
        'mail.models.ThreadCache.fields.onHasToLoadMessagesChanged',
        'mail.models.ThreadCache.fields.onMessagesChanged',
        'mail.models.ThreadCache.fields.orderedFetchedMessages',
        'mail.models.ThreadCache.fields.orderedMessages',
        'mail.models.ThreadCache.fields.stringifiedDomain',
        'mail.models.ThreadCache.fields.thread',
        'mail.models.ThreadCache.fields.threadViews',
        'mail.models.ThreadCache.fields.uncheckedMessages',
    ],
});
