/** @odoo-module alias=mail.models.ChatWindowManager.fields.hasHiddenChatWindows **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'hasHiddenChatWindows',
    id: 'mail.models.ChatWindowManager.fields.hasHiddenChatWindows',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {ChatWindowManager} param0.record
     * @returns {boolean}
     */
    compute({ ctx, record }) {
        return record.allOrderedHidden(ctx).length > 0;
    },
});
