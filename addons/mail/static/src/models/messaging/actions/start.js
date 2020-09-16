/** @odoo-module alias=mail.models.Messaging.actions.start **/

import action from 'mail.action.define';

/**
 * Starts messaging and related records.
 */
export default action({
    name: 'Messaging/start',
    id: 'mail.models.Messaging.actions.start',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Messaging} messaging
     */
    async func(
        { ctx, env },
        messaging,
    ) {
        const _onWindowFocus = () => {
            () => env.services.action.dispatch(
                'Messaging/_handleGlobalWindowFocus',
                messaging,
            );
        };
        Object.assign(messaging, { _onWindowFocus });
        env.services['bus_service'].on(
            'window_focus',
            null,
            messaging._onWindowFocus,
        );
        await env.services.action.dispatch(
            'Record/doAsync',
            messaging,
            () => env.services.action.dispatch(
                'MessagingInitializer/start',
                messaging.initializer(ctx),
            ),
        );
        env.services.action.dispatch(
            'MessagingNotificationHandler/start',
            messaging.notificationHandler(ctx),
        );
        env.services.action.dispatch(
            'Record/update',
            messaging,
            { isInitialized: true },
        );
    },
});
