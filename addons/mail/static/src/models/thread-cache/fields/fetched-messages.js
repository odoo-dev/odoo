/** @odoo-module alias=mail.models.ThreadCache.fields.fetchedMessages **/

import many2many from 'mail.model.field.many2many.define';

/**
 * List of messages that have been fetched by this cache.
 *
 * This DOES NOT necessarily includes all messages linked to this thread
 * cache (@see messages field for that): it just contains list
 * of successive messages that have been explicitly fetched by this
 * cache. For all non-main caches, this corresponds to all messages.
 * For the main cache, however, messages received from longpolling
 * should be displayed on main cache but they have not been explicitly
 * fetched by cache, so they ARE NOT in this list (at least, not until a
 * fetch on this thread cache contains this message).
 *
 * The distinction between messages and fetched messages is important
 * to manage "holes" in message list, while still allowing to display
 * new messages on main cache of thread in real-time.
 */
export default many2many({
    name: 'fetchedMessages',
    id: 'mail.models.ThreadCache.fields.fetchedMessages',
    global: true,
    target: 'Message',
    /**
     * Adjust with messages unlinked from thread
     *
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {ThreadCache} param0.record
     * @returns {Message[]}
     */
        compute({ ctx, env, record }) {
        if (!record.thread(ctx)) {
            return env.services.action.dispatch(
                'RecordFieldCommand/unlinkAll',
            );
        }
        const toUnlinkMessages = [];
        for (const message of record.fetchedMessages(ctx)) {
            if (!record.thread(ctx).messages(ctx).includes(message)) {
                toUnlinkMessages.push(message);
            }
        }
        return env.services.action.dispatch(
            'RecordFieldCommand/unlink',
            toUnlinkMessages,
        );
    },
});
