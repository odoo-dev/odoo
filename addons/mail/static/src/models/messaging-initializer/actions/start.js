/** @odoo-module alias=mail.models.MessagingInitializer.actions.start **/

import action from 'mail.action.define';

/**
 * Fetch messaging data initially to populate the store specifically for
 * the current user. This includes pinned channels for instance.
 */
export default action({
    name: 'MessagingInitializer/start',
    id: 'mail.models.MessagingInitializer.actions.start',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {MessagingInitializer} messagingInitializer
     */
    async func(
        { ctx, env },
        messagingInitializer,
    ) {
        env.services.action.dispatch(
            'Record/update',
            messagingInitializer.messaging(ctx),
            {
                history: env.services.action.dispatch(
                    'RecordFieldCommand/create',
                    {
                        id: 'history',
                        isServerPinned: true,
                        model: 'mail.box',
                        name: env._t("History"),
                    },
                ),
                inbox: env.services.action.dispatch(
                    'RecordFieldCommand/create',
                    {
                        id: 'inbox',
                        isServerPinned: true,
                        model: 'mail.box',
                        name: env._t("Inbox"),
                    },
                ),
                moderation: env.services.action.dispatch(
                    'RecordFieldCommand/create',
                    {
                        id: 'moderation',
                        model: 'mail.box',
                        name: env._t("Moderation"),
                    },
                ),
                starred: env.services.action.dispatch(
                    'RecordFieldCommand/create',
                    {
                        id: 'starred',
                        isServerPinned: true,
                        model: 'mail.box',
                        name: env._t("Starred"),
                    },
                ),
            },
        );
        const device = messagingInitializer.messaging(ctx).device(ctx);
        env.services.action.dispatch(
            'Device/start',
            device,
        );
        env.services.action.dispatch(
            'ChatWindowManager/start',
            messagingInitializer.messaging(ctx).chatWindowManager(ctx),
        );
        const context = {
            isMobile: device.isMobile(ctx),
            ...env.session.user_context,
        };
        const discuss = messagingInitializer.messaging(ctx).discuss(ctx);
        const data = await env.services.action.dispatch(
            'Record/doAsync',
            messagingInitializer,
            () => env.services.rpc({
                route: '/mail/init_messaging',
                params: { context },
            }, { shadow: true }),
        );
        await env.services.action.dispatch(
            'Record/doAsync',
            messagingInitializer,
            () => env.services.action.dispatch(
                'MessagingInitializer/_init',
                messagingInitializer,
                data,
            ),
        );
        if (discuss.isOpen(ctx)) {
            env.services.action.dispatch(
                'Discuss/openInitThread',
                discuss,
            );
        }
        if (env.autofetchPartnerImStatus) {
            env.services.action.dispatch(
                'Partner/startLoopFetchImStatus',
            );
        }
    },
});
