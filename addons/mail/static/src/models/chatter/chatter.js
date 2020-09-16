/** @odoo-module alias=mail.models.Chatter **/

import model from 'mail.model.define';

export default model({
    name: 'Chatter',
    id: 'mail.models.Chatter',
    global: true,
    actions: [
        'mail.models.Chatter.actions._prepareAttachmentsLoading',
        'mail.models.Chatter.actions._stopAttachmentsLoading',
        'mail.models.Chatter.actions.focus',
        'mail.models.Chatter.actions.refresh',
        'mail.models.Chatter.actions.showLogNote',
        'mail.models.Chatter.actions.showSendMessage',
        'mail.models.Chatter.actions.toggleActivityBoxVisibility',
    ],
    fields: [
        'mail.models.Chatter.fields.composer',
        'mail.models.Chatter.fields.context',
        'mail.models.Chatter.fields.hasActivities',
        'mail.models.Chatter.fields.hasExternalBorder',
        'mail.models.Chatter.fields.hasFollowers',
        'mail.models.Chatter.fields.hasMessageList',
        'mail.models.Chatter.fields.hasMessageListScrollAdjust',
        'mail.models.Chatter.fields.hasThreadView',
        'mail.models.Chatter.fields.hasTopbarCloseButton',
        'mail.models.Chatter.fields.isActivityBoxVisible',
        'mail.models.Chatter.fields.isAttachmentBoxVisible',
        'mail.models.Chatter.fields.isAttachmentBoxVisibleInitially',
        'mail.models.Chatter.fields.isComposerVisible',
        'mail.models.Chatter.fields.isDisabled',
        'mail.models.Chatter.fields.isDoFocus',
        'mail.models.Chatter.fields.isShowingAttachmentsLoading',
        'mail.models.Chatter.fields.onThreadIdOrThreadModelChanged',
        'mail.models.Chatter.fields.onThreadIsLoadingAttachmentsChanged',
        'mail.models.Chatter.fields.thread',
        'mail.models.Chatter.fields.threadId',
        'mail.models.Chatter.fields.threadIsLoadingAttachments',
        'mail.models.Chatter.fields.threadModel',
        'mail.models.Chatter.fields.threadView',
        'mail.models.Chatter.fields.threadViewer',
    ],
    lifecycles: [
        'mail.models.Chatter.lifecycles.onDelete',
    ],
});
