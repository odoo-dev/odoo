/** @odoo-module alias=mail.models.ChatWindowManager.fields.hasVisibleChatWindows **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'hasVisibleChatWindows',
    id: 'mail.models.ChatWindowManager.fields.hasVisibleChatWindows',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {ChatWindowManager} param0.record
     * @returns {boolean}
     */
    compute({ ctx, record }) {
        return record.allOrderedVisible(ctx).length > 0;
    },
});
