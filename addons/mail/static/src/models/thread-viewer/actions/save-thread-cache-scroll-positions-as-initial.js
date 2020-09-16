/** @odoo-module alias=mail.models.ThreadViewer.actions.saveThreadCacheScrollPositionsAsInitial **/

import action from 'mail.action.define';

export default action({
    name: 'ThreadViewer/saveThreadCacheScrollPositionsAsInitial',
    id: 'mail.models.ThreadViewer.actions.saveThreadCacheScrollPositionsAsInitial',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {ThreadViewer} threadViewer
     * @param {integer} scrollTop
     * @param {ThreadCache} threadCache
     */
    func(
        { ctx, env },
        threadViewer,
        scrollTop,
        threadCache,
    ) {
        threadCache = threadCache || threadViewer.threadCache(ctx);
        if (!threadCache) {
            return;
        }
        if (threadViewer.chatter(ctx)) {
            // Initial scroll position is disabled for chatter because it is
            // too complex to handle correctly and less important
            // functionally.
            return;
        }
        env.services.action.dispatch(
            'Record/update',
            threadViewer,
            {
                threadCacheInitialScrollPositions: {
                    ...threadViewer.threadCacheInitialScrollPositions(ctx),
                    [threadCache.localId]: scrollTop,
                },
            },
        );
    },
});
