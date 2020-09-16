/** @odoo-module alias=mail.models.ChatWindowManager **/

import model from 'mail.model.define';

export default model({
    name: 'ChatWindowManager',
    id: 'mail.models.ChatWindowManager',
    global: true,
    actions: [
        'mail.models.ChatWindowManager.actions._onHideHomeMenu',
        'mail.models.ChatWindowManager.actions._onShowHomeMenu',
        'mail.models.ChatWindowManager.actions.closeAll',
        'mail.models.ChatWindowManager.actions.closeHiddenMenu',
        'mail.models.ChatWindowManager.actions.closeThread',
        'mail.models.ChatWindowManager.actions.openHiddenMenu',
        'mail.models.ChatWindowManager.actions.openNewMessage',
        'mail.models.ChatWindowManager.actions.openThread',
        'mail.models.ChatWindowManager.actions.shiftNext',
        'mail.models.ChatWindowManager.actions.shiftPrev',
        'mail.models.ChatWindowManager.actions.start',
        'mail.models.ChatWindowManager.actions.stop',
        'mail.models.ChatWindowManager.actions.swap',
    ],
    fields: [
        'mail.models.ChatWindowManager.fields._ordered',
        'mail.models.ChatWindowManager.fields.allOrdered',
        'mail.models.ChatWindowManager.fields.allOrderedHidden',
        'mail.models.ChatWindowManager.fields.allOrderedVisible',
        'mail.models.ChatWindowManager.fields.chatWindows',
        'mail.models.ChatWindowManager.fields.hasHiddenChatWindows',
        'mail.models.ChatWindowManager.fields.hasVisibleChatWindows',
        'mail.models.ChatWindowManager.fields.isHiddenMenuOpen',
        'mail.models.ChatWindowManager.fields.lastVisible',
        'mail.models.ChatWindowManager.fields.messaging',
        'mail.models.ChatWindowManager.fields.newMessageChatWindow',
        'mail.models.ChatWindowManager.fields.unreadHiddenConversationAmount',
        'mail.models.ChatWindowManager.fields.visual',
    ],
});
