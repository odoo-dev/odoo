/** @odoo-module alias=mail.models.ChatWindow.fields.isVisible **/

import attr from 'mail.model.field.attr.define';

/**
 * States whether `this` is visible or not. Should be considered
 * read-only. Setting this value manually will not make it visible.
 * @see `ChatWindow/makeVisible`
 */
export default attr({
    name: 'isVisible',
    id: 'mail.models.ChatWindow.fields.isVisible',
    global: true,
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
        return record.manager(ctx).allOrderedVisible(ctx).includes(record);
    },
});
