/** @odoo-module alias=mail.models.ThreadView.fields.onThreadCacheChanged **/

import attr from 'mail.model.field.attr.define';

/**
 * Not a real field, used to do something when there is a change
 * of thread cache.
 */
export default attr({
    name: 'onThreadCacheChanged',
    id: 'mail.models.ThreadView.fields.onThreadCacheChanged',
    global: true,
    dependencies: [
        'threadCache'
    ],
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {ThreadView} param0.record
     */
    compute({ ctx, env, record }) {
        // clear obsolete hints
        env.services.action.dispatch(
            'Record/update',
            record,
            {
                componentHintList: env.services.action.dispatch(
                    'RecordFieldCommand/clear',
                ),
            },
        );
        env.services.action.dispatch(
            'ThreadView/addComponentHint',
            record,
            'change-of-thread-cache',
        );
        if (record.threadCache(ctx)) {
            env.services.action.dispatch(
                'Record/update',
                record.threadCache(ctx),
                {
                    isCacheRefreshRequested: true,
                    isMarkAllAsReadRequested: true,
                },
            );
        }
        env.services.action.dispatch(
            'Record/update',
            record,
            {
                lastVisibleMessage: env.services.action.dispatch(
                    'RecordFieldCommand/unlink',
                ),
            },
        );
    },
});
