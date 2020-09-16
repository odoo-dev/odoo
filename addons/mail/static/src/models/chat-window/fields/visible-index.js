/** @odoo-module alias=mail.models.ChatWindow.fields.visibleIndex **/

import attr from 'mail.model.field.attr.define';

/**
 * This field handle the "order" (index) of the visible chatWindow
 * inside the UI.
 *
 * Using LTR, the right-most chat window has index 0, and the number is
 * incrementing from right to left.
 * Using RTL, the left-most chat window has index 0, and the number is
 * incrementing from left to right.
 */
export default attr({
    name: 'visibleIndex',
    id: 'mail.models.ChatWindow.fields.visibleIndex',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {ChatWindow} param0.record
     * @returns {integer|undefined}
     */
    compute({ ctx, env, record }) {
        if (!record.manager(ctx)) {
            return env.services.action.dispatch(
                'RecordFieldCommand/clear',
            );
        }
        const visible = record.manager(ctx).visual(ctx).visible;
        const index = visible.findIndex(
            visible => visible.chatWindowLocalId === record.localId,
        );
        if (index === -1) {
            return env.services.action.dispatch(
                'RecordFieldCommand/clear',
            );
        }
        return index;
    },
});
