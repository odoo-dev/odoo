/** @odoo-module alias=mail.models.Thread.fields.isPinned **/

import attr from 'mail.model.field.attr.define';

/**
 * Boolean that determines whether this thread is pinned
 * in discuss and present in the messaging menu.
 */
export default attr({
    name: 'isPinned',
    id: 'mail.models.Thread.fields.isPinned',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {Thread} param0.record
     * @returns {boolean}
     */
    compute({ ctx, record }) {
        return (
            record.isPendingPinned(ctx) ??
            record.isServerPinned(ctx)
        );
    },
});
