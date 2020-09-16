/** @odoo-module alias=mail.models.ChatWindowManager.fields.unreadHiddenConversationAmount **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'unreadHiddenConversationAmount',
    id: 'mail.models.ChatWindowManager.fields.unreadHiddenConversationAmount',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {ChatWindowManager} param0.record
     * @returns {integer}
     */
    compute({ ctx, record }) {
        const allHiddenWithThread = record.allOrderedHidden(ctx).filter(
            chatWindow => chatWindow.thread(ctx),
        );
        let amount = 0;
        for (const chatWindow of allHiddenWithThread) {
            if (chatWindow.thread(ctx).localMessageUnreadCounter(ctx) > 0) {
                amount++;
            }
        }
        return amount;
    },
});
