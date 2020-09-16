/** @odoo-module alias=mail.models.Messaging.actions.stop **/

import action from 'mail.action.define';

export default action({
    name: 'Messaging/stop',
    id: 'mail.models.Messaging.actions.stop',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Messaging} messaging
     */
    func(
        { ctx, env },
        messaging,
    ) {
        env.services['bus_service'].off(
            'window_focus',
            null,
            messaging._onWindowFocus,
        );
        messaging._onWindowFocus = () => {};
        env.services.action.dispatch(
            'MessagingInitializer/stop',
            messaging.initializer(ctx),
        );
        env.services.action.dispatch(
            'MessagingNotificationHandler/stop',
            messaging.notificationHandler(ctx),
        );
    },
});
