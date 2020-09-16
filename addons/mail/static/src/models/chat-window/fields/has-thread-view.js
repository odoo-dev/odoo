/** @odoo-module alias=mail.models.ChatWindow.fields.hasThreadView **/

import attr from 'mail.model.field.attr.define';

/**
 * Determines whether `this.thread` should be displayed.
 */
export default attr({
    name: 'hasThreadView',
    id: 'mail.models.ChatWindow.fields.hasThreadView',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {ChatWindow} param0.record
     * @returns {boolean}
     */
    compute({ ctx, record }) {
        return (
            record.isVisible(ctx) &&
            !record.isFolded(ctx) &&
            record.thread(ctx)
        );
    },
});
