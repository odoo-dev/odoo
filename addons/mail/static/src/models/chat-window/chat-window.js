/** @odoo-module alias=mail.models.ChatWindow **/

import model from 'mail.model.define';

export default model({
    name: 'ChatWindow',
    id: 'mail.models.ChatWindow',
    global: true,
    actions: [
        'mail.models.ChatWindow.actions._getNextVisibleUnfoldedChatWindow',
        'mail.models.ChatWindow.actions.close',
        'mail.models.ChatWindow.actions.expand',
        'mail.models.ChatWindow.actions.focus',
        'mail.models.ChatWindow.actions.focusNextVisibleUnfoldedChatWindow',
        'mail.models.ChatWindow.actions.focusPreviousVisibleUnfoldedChatWindow',
        'mail.models.ChatWindow.actions.fold',
        'mail.models.ChatWindow.actions.makeActive',
        'mail.models.ChatWindow.actions.makeVisible',
        'mail.models.ChatWindow.actions.shiftNext',
        'mail.models.ChatWindow.actions.shiftPrev',
        'mail.models.ChatWindow.actions.unfold',
    ],
    fields: [
        'mail.models.ChatWindow.fields.hasNewMessageForm',
        'mail.models.ChatWindow.fields.hasShiftNext',
        'mail.models.ChatWindow.fields.hasShiftPrev',
        'mail.models.ChatWindow.fields.hasThreadView',
        'mail.models.ChatWindow.fields.isDoFocus',
        'mail.models.ChatWindow.fields.isFocused',
        'mail.models.ChatWindow.fields.isFolded',
        'mail.models.ChatWindow.fields.isVisible',
        'mail.models.ChatWindow.fields.manager',
        'mail.models.ChatWindow.fields.name',
        'mail.models.ChatWindow.fields.thread',
        'mail.models.ChatWindow.fields.threadView',
        'mail.models.ChatWindow.fields.threadViewer',
        'mail.models.ChatWindow.fields.visibleIndex',
        'mail.models.ChatWindow.fields.visibleOffset',
    ],
});
