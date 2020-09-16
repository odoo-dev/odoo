/** @odoo-module alias=mail.models.ThreadViewer.fields.hasThreadView **/

import attr from 'mail.model.field.attr.define';

/**
 * Determines whether `this.thread` should be displayed.
 */
export default attr({
    name: 'hasThreadView',
    id: 'mail.models.ThreadViewer.fields.hasThreadView',
    global: true,
    default: false,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {ThreadViewer} param0.record
     * @returns {boolean}
     */
    compute({ ctx, record }) {
        if (record.chatter(ctx)) {
            return record.chatter(ctx).hasThreadView(ctx);
        }
        if (record.chatWindow(ctx)) {
            return record.chatWindow(ctx).hasThreadView(ctx);
        }
        if (record.discuss(ctx)) {
            return record.discuss(ctx).hasThreadView(ctx);
        }
        return record.hasThreadView(ctx);
    },
});
