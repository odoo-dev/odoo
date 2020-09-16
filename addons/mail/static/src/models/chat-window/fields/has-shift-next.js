/** @odoo-module alias=mail.models.ChatWindow.fields.hasShiftNext **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'hasShiftNext',
    id: 'mail.models.ChatWindow.fields.hasShiftNext',
    global: true,
    default: false,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {ChatWindow} param0.record
     * @returns {boolean}
     */
    compute({ ctx, record }) {
        if (!record.manager(ctx)) {
            return false;
        }
        const index = record.manager(ctx).allOrderedVisible(ctx).findIndex(
            visible => visible === record,
        );
        if (index === -1) {
            return false;
        }
        return index > 0;
    },
});
