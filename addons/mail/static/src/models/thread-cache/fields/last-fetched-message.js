/** @odoo-module alias=mail.models.ThreadCache.fields.lastFetchedMessage **/

import many2one from 'mail.model.field.many2one.define';

/**
 * Last message that has been fetched by this thread cache.
 *
 * This DOES NOT necessarily mean the last message linked to this thread
 * cache (@see lastMessage field for that). @see fetchedMessages field
 * for a deeper explanation about "fetched" messages.
 */
export default many2one({
    name: 'lastFetchedMessage',
    id: 'mail.models.ThreadCache.fields.lastFetchedMessage',
    global: true,
    target: 'Message',
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {ThreadCache} param0.record
     * @returns {Message|undefined}
     */
    compute({ ctx, env, record }) {
        const {
            length: l,
            [l - 1]: lastFetchedMessage,
        } = record.orderedFetchedMessages(ctx);
        if (!lastFetchedMessage) {
            return env.services.action.dispatch(
                'RecordFieldCommand/unlink',
            );
        }
        return env.services.action.dispatch(
            'RecordFieldCommand/link',
            lastFetchedMessage,
        );
    },
});
