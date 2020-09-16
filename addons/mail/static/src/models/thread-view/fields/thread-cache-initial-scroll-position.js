/** @odoo-module alias=mail.models.ThreadView.fields.threadCacheInitialScrollPosition **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'threadCacheInitialScrollPosition',
    id: 'mail.models.ThreadView.fields.threadCacheInitialScrollPosition',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {ThreadView} param0.record
     * @returns {integer|undefined}
     */
    compute({ ctx, env, record }) {
        if (!record.threadCache(ctx)) {
            return env.services.action.dispatch(
                'RecordFieldCommand/clear',
            );
        }
        const threadCacheInitialScrollPosition =
            record.threadCacheInitialScrollPositions(ctx)[
                record.threadCache(ctx).localId
            ];
        if (threadCacheInitialScrollPosition !== undefined) {
            return threadCacheInitialScrollPosition;
        }
        return env.services.action.dispatch(
            'RecordFieldCommand/clear',
        );
    },
});
