/** @odoo-module alias=mail.models.ChatWindow.fields.hasShiftPrev **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'hasShiftPrev',
    id: 'mail.models.ChatWindow.fields.hasShiftPrev',
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
        const allVisible = record.manager(ctx).allOrderedVisible(ctx);
        const index = allVisible.findIndex(visible => visible === record);
        if (index === -1) {
            return false;
        }
        return index < allVisible.length - 1;
    },
});
