/** @odoo-module alias=mail.models.ThreadView **/

import model from 'mail.model.define';

export default model({
    name: 'ThreadView',
    id: 'mail.models.ThreadView',
    global: true,
    actions: [
        'mail.models.ThreadView.actions.addComponentHint',
        'mail.models.ThreadView.actions.handleVisibleMessage',
        'mail.models.ThreadView.actions.markComponentHintProcessed',
    ],
    fields: [
        'mail.models.ThreadView.fields.checkedMessages',
        'mail.models.ThreadView.fields.componentHintList',
        'mail.models.ThreadView.fields.composer',
        'mail.models.ThreadView.fields.hasAutoScrollOnMessageReceived',
        'mail.models.ThreadView.fields.hasComposerFocus',
        'mail.models.ThreadView.fields.isLoading',
        'mail.models.ThreadView.fields.isPreparingLoading',
        'mail.models.ThreadView.fields.lastMessage',
        'mail.models.ThreadView.fields.lastNonTransientMessage',
        'mail.models.ThreadView.fields.lastVisibleMessage',
        'mail.models.ThreadView.fields.messages',
        'mail.models.ThreadView.fields.nonEmptyMessages',
        'mail.models.ThreadView.fields.onThreadCacheChanged',
        'mail.models.ThreadView.fields.onThreadCacheIsLoadingChanged',
        'mail.models.ThreadView.fields.onThreadShouldBeSetAsSeen',
        'mail.models.ThreadView.fields.stringifiedDomain',
        'mail.models.ThreadView.fields.thread',
        'mail.models.ThreadView.fields.threadCache',
        'mail.models.ThreadView.fields.threadCacheInitialScrollHeight',
        'mail.models.ThreadView.fields.threadCacheInitialScrollPosition',
        'mail.models.ThreadView.fields.threadCacheInitialScrollPositions',
        'mail.models.ThreadView.fields.threadViewer',
        'mail.models.ThreadView.fields.uncheckedMessages',
    ],
});
