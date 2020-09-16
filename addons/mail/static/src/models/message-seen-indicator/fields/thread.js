/** @odoo-module alias=mail.models.MessageSeenIndicator.fields.thread **/

import many2one from 'mail.model.field.many2one.define';

/**
 * The thread concerned by this seen indicator.
 * This is automatically computed based on channelId field.
 * @see channelId
 */
export default many2one({
    name: 'thread',
    id: 'mail.models.MessageSeenIndicator.fields.thread',
    global: true,
    target: 'Thread',
    inverse: 'messageSeenIndicators',
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {MessageSeenIndicator} param0.record
     * @returns {Thread}
     */
    compute({ ctx, env, record }) {
        return env.services.action.dispatch(
            'RecordFieldCommand/insert',
            {
                id: record.channelId(ctx),
                model: 'mail.channel',
            },
        );
    },
});
