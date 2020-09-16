/** @odoo-module alias=mail.models.ThreadCache.actions.loadMoreMessages **/

import action from 'mail.action.define';

export default action({
    name: 'ThreadCache/loadMoreMessages',
    id: 'mail.models.ThreadCache.actions.loadMoreMessages',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {ThreadCache} threadCache
     */
    async func(
        { ctx, env },
        threadCache,
    ) {
        if (
            threadCache.isAllHistoryLoaded(ctx) ||
            threadCache.isLoading(ctx)
        ) {
            return;
        }
        if (!threadCache.isLoaded(ctx)) {
            env.services.action.dispatch(
                'Record/update',
                threadCache,
                { isCacheRefreshRequested: true },
            );
            return;
        }
        env.services.action.dispatch(
            'Record/update',
            threadCache,
            { isLoadingMore: true },
        );
        const messageIds = threadCache.fetchedMessages(ctx).map(
            message => message.id(ctx),
        );
        const limit = 30;
        let fetchedMessages;
        let success;
        try {
            fetchedMessages = await env.services.action.dispatch(
                'Record/dosync',
                () => env.services.action.dispatch(
                    'ThreadCache/_loadMessages',
                    threadCache,
                    {
                        extraDomain: [['id', '<', Math.min(...messageIds)]],
                        limit,
                    },
                ),
            );
            success = true;
        } catch (e) {
            success = false;
        }
        if (success) {
            if (fetchedMessages.length < limit) {
                env.services.action.dispatch(
                    'Record/update',
                    threadCache,
                    { isAllHistoryLoaded: true },
                );
            }
            for (const threadView of threadCache.threadViews(ctx)) {
                env.services.action.dispatch(
                    'ThreadView/addComponentHint',
                    threadView,
                    'more-messages-loaded',
                    { fetchedMessages },
                );
            }
        }
        env.services.action.dispatch(
            'Record/update',
            threadCache,
            { isLoadingMore: false },
        );
    },
});
