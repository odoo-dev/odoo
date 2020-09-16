/** @odoo-module alias=mail.models.ThreadViewer **/

import model from 'mail.model.define';

export default model({
    name: 'ThreadViewer',
    id: 'mail.models.ThreadViewer',
    global: true,
    actions: [
        'mail.models.ThreadViewer.actions.saveThreadCacheScrollHeightAsInitial',
        'mail.models.ThreadViewer.actions.saveThreadCacheScrollPositionsAsInitial',
    ],
    fields: [
        'mail.models.ThreadViewer.fields.chatter',
        'mail.models.ThreadViewer.fields.chatWindow',
        'mail.models.ThreadViewer.fields.discuss',
        'mail.models.ThreadViewer.fields.hasThreadView',
        'mail.models.ThreadViewer.fields.stringifiedDomain',
        'mail.models.ThreadViewer.fields.thread',
        'mail.models.ThreadViewer.fields.threadCache',
        'mail.models.ThreadViewer.fields.threadCacheInitialScrollHeights',
        'mail.models.ThreadViewer.fields.threadCacheInitialScrollPositions',
        'mail.models.ThreadViewer.fields.threadView',
    ],
});
