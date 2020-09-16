/** @odoo-module alias=mail.models.Discuss.actions.openInitThread **/

import action from 'mail.action.define';

/**
 * Open thread from init active id. `initActiveId` is used to refer to
 * a thread that we may not have full data yet, such as when messaging
 * is not yet initialized.
 */
export default action({
    name: 'Discuss/openInitThread',
    id: 'mail.models.Discuss.actions.openInitThread',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Discuss} discuss
     */
    func(
        { ctx, env },
        discuss,
    ) {
        const [model, id] = typeof discuss.initActiveId(ctx) === 'number'
            ? ['mail.channel', discuss.initActiveId(ctx)]
            : discuss.initActiveId(ctx).split('_');
        const thread = env.services.action.dispatch(
            'Thread/findById',
            {
                id: model !== 'mail.box' ? Number(id) : id,
                model,
            },
        );
        if (!thread) {
            return;
        }
        env.services.action.dispatch(
            'Thread/open',
            thread,
        );
        if (
            env.services.model.messaging.device(ctx).isMobile(ctx) &&
            thread.channelType(ctx)
        ) {
            env.services.action.dispatch(
                'Record/update',
                discuss,
                { activeMobileNavbarTabId: thread.channelType(ctx) },
            );
        }
    },
});
