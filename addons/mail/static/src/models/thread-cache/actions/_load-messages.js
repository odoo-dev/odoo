/** @odoo-module alias=mail.models.ThreadCache.actions._loadMessages **/

import action from 'mail.action.define';

export default action({
    name: 'ThreadCache/_loadMessages',
    id: 'mail.models.ThreadCache.actions._loadMessages',
    global: true,
    /**
     * @private
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {ThreadCache} threadCache
     * @param {Object} [param2={}]
     * @param {Array[]} [param2.extraDomain]
     * @param {integer} [param2.limit=30]
     * @returns {Message[]}
     * @throws {Error} when failed to load messages
     */
    async func(
        { ctx, env },
        threadCache,
        {
            extraDomain,
            limit = 30,
        } = {},
    ) {
        env.services.action.dispatch(
            'Record/update',
            threadCache,
            { isLoading: true },
        );
        const searchDomain = JSON.parse(
            threadCache.stringifiedDomain(ctx),
        );
        let domain = searchDomain.length ? searchDomain : [];
        domain = env.services.action.dispatch(
            'ThreadCache/_extendMessageDomain',
            threadCache,
            domain,
        );
        if (extraDomain) {
            domain = extraDomain.concat(domain);
        }
        const context = env.session.user_context;
        const moderated_channel_ids = threadCache.thread(ctx).moderation(ctx)
            ? [threadCache.thread(ctx).id(ctx)]
            : undefined;
        let messages;
        try {
            messages = await env.services.action.dispatch(
                'Record/doAsync',
                threadCache,
                () => env.services.action.dispatch(
                    'Message/performRpcMessageFetch',
                    domain,
                    limit,
                    moderated_channel_ids,
                    context,
                ),
            );
        } catch (e) {
            env.services.action.dispatch(
                'Record/update',
                threadCache,
                {
                    hasLoadingFailed: true,
                    isLoading: false,
                },
            );
            throw e;
        }
        env.services.action.dispatch(
            'Record/update',
            threadCache,
            {
                fetchedMessages: env.services.action.dispatch(
                    'RecordFieldCommand/link',
                    messages,
                ),
                hasLoadingFailed: false,
                isLoaded: true,
                isLoading: false,
            },
        );
        if (!extraDomain && messages.length < limit) {
            env.services.action.dispatch(
                'Record/update',
                threadCache,
                { isAllHistoryLoaded: true },
            );
        }
        env.services.model.messagingBus.trigger(
            'o-thread-cache-loaded-messages',
            {
                fetchedMessages: messages,
                threadCache,
            },
        );
        return messages;
    },
});
