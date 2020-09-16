/** @odoo-module alias=mail.models.MessageSeenIndicator.fields.message **/

import many2one from 'mail.model.field.many2one.define';

/**
 * The message concerned by this seen indicator.
 * This is automatically computed based on messageId field.
 * @see MessageSeenIndicator:messageId
 */
export default many2one({
    name: 'message',
    id: 'mail.models.MessageSeenIndicator.fields.message',
    global: true,
    target: 'Message',
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {MessageSeenIndicator} param0.record
     * @returns {Message}
     */
    compute({ ctx, env, record }) {
        return env.services.action.dispatch(
            'RecordFieldCommand/insert',
            { id: record.messageId(ctx) },
        );
    },
});
