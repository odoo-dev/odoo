/** @odoo-module alias=mail.models.ThreadCache.fields.onMessagesChanged **/

import attr from 'mail.model.field.attr.define';

/**
 * Not a real field, used to trigger `_onMessagesChanged` when one of
 * the dependencies changes.
 */
export default attr({
    name: 'onMessagesChanged',
    id: 'mail.models.ThreadCache.fields.onMessagesChanged',
    global: true,
    dependencies: [
        'messages',
        'thread',
        'threadMainCache',
    ],
    /**
     * Handles change of messages on this thread cache. This is useful to
     * refresh non-main caches that are currently displayed when the main
     * cache receives updates. This is necessary because only the main cache
     * is aware of changes in real time.
     *
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {ThreadCache} param0.record
     */
    compute({ ctx, env, record }) {
        if (!record.thread(ctx)) {
            return;
        }
        if (record.thread(ctx).mainCache(ctx) !== record) {
            return;
        }
        for (const threadView of record.thread(ctx).threadViews(ctx)) {
            if (threadView.threadCache(ctx)) {
                env.services.action.dispatch(
                    'Record/update',
                    threadView.threadCache(ctx),
                    { isCacheRefreshRequested: true },
                );
            }
        }
    },
});
