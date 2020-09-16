/** @odoo-module alias=mail.models.ThreadViewer.fields.stringifiedDomain **/

import attr from 'mail.model.field.attr.define';

/**
 * Determines the domain to apply when fetching messages for `this.thread`.
 */
export default attr({
    name: 'stringifiedDomain',
    id: 'mail.models.ThreadViewer.fields.stringifiedDomain',
    global: true,
    default: '[]',
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {ThreadViewer} param0.record
     * @returns {string}
     */
    compute({ ctx, record }) {
        if (record.chatter(ctx)) {
            return '[]';
        }
        if (record.chatWindow(ctx)) {
            return '[]';
        }
        if (record.discuss(ctx)) {
            return record.discuss(ctx).stringifiedDomain(ctx);
        }
        return record.stringifiedDomain(ctx);
    },
});
