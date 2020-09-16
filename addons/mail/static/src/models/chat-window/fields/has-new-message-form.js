/** @odoo-module alias=mail.models.ChatWindow.fields.hasNewMessageForm **/

import attr from 'mail.model.field.attr.define';

/**
 * Determines whether "new message form" should be displayed.
 */
export default attr({
    name: 'hasNewMessageForm',
    id: 'mail.models.ChatWindow.fields.hasNewMessageForm',
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
            !record.thread(ctx)
        );
    },
});
