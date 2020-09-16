/** @odoo-module alias=mail.models.ThreadViewer.actions.saveThreadCacheScrollHeightAsInitial **/

import action from 'mail.action.define';

export default action({
    name: 'ThreadViewer/saveThreadCacheScrollHeightAsInitial',
    id: 'mail.models.ThreadViewer.actions.saveThreadCacheScrollHeightAsInitial',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {ThreadViewer} threadViewer
     * @param {integer} scrollHeight
     * @param {ThreadCache} threadCache
     */
    func(
        { ctx, env },
        threadViewer,
        scrollHeight,
        threadCache,
    ) {
        threadCache = threadCache || threadViewer.threadCache(ctx);
        if (!threadCache) {
            return;
        }
        if (threadViewer.chatter(ctx)) {
            // Initial scroll height is disabled for chatter because it is
            // too complex to handle correctly and less important
            // functionally.
            return;
        }
        env.services.action.dispatch(
            'Record/update',
            threadViewer,
            {
                threadCacheInitialScrollHeights: {
                    ...threadViewer.threadCacheInitialScrollHeights(ctx),
                    [threadCache.localId]: scrollHeight,
                },
            },
        );
    },
});
