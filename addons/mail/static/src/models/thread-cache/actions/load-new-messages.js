/** @odoo-module alias=mail.models.ThreadCache.actions.loadNewMessages **/

import action from 'mail.action.define';

export default action({
    name: 'ThreadCache/loadNewMessages',
    id: 'mail.models.ThreadCache.actions.loadNewMessages',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {ThreadCache} threadCache
     * @returns {Message[]|undefined}
     */
    async func(
        { ctx, env },
        threadCache,
    ) {
        if (threadCache.isLoading(ctx)) {
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
        const messageIds = threadCache.fetchedMessages(ctx).map(
            message => message.id(ctx),
        );
        const fetchedMessages = env.services.action.dispatch(
            'ThreadCache/_loadMessages',
            {
                extraDomain: [['id', '>', Math.max(...messageIds)]],
                limit: false,
            },
        );
        if (!fetchedMessages) {
            return;
        }
        for (const threadView of threadCache.threadViews(ctx)) {
            env.services.action.dispatch(
                'ThreadView/addComponentHint',
                threadView,
                'new-messages-loaded',
                { fetchedMessages },
            );
        }
        return fetchedMessages;
    },
});
