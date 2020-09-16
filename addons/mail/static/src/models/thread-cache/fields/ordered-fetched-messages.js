/** @odoo-module alias=mail.models.ThreadCache.fields.orderedFetchedMessages **/

import many2many from 'mail.model.field.many2many.define';

/**
 * Ordered list of messages that have been fetched by this cache.
 *
 * This DOES NOT necessarily includes all messages linked to this thread
 * cache (@see orderedMessages field for that). @see fetchedMessages
 * field for deeper explanation about "fetched" messages.
 */
export default many2many({
    name: 'orderedFetchedMessages',
    id: 'mail.models.ThreadCache.fields.orderedFetchedMessages',
    global: true,
    target: 'Message',
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {ThreadCache} param0.record
     * @returns {Message[]}
     */
    compute({ ctx, env, record }) {
        return env.services.action.dispatch(
            'RecordFieldCommand/replace',
            record.fetchedMessages(ctx).sort(
                (m1, m2) => m1.id(ctx) < m2.id(ctx) ? -1 : 1,
            ),
        );
    },
});
