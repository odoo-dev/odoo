/** @odoo-module alias=mail.models.ThreadView.fields.threadCacheInitialScrollHeight **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'threadCacheInitialScrollHeight',
    id: 'mail.models.ThreadView.fields.threadCacheInitialScrollHeight',
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
        const threadCacheInitialScrollHeight =
            record.threadCacheInitialScrollHeights(ctx)[
                record.threadCache(ctx).localId
            ](ctx);
        if (threadCacheInitialScrollHeight !== undefined) {
            return threadCacheInitialScrollHeight;
        }
        return env.services.action.dispatch(
            'RecordFieldCommand/clear',
        );
    },
});
