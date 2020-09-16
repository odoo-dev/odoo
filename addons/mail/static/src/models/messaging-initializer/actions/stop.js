/** @odoo-module alias=mail.models.MessagingInitializer.actions.stop **/

import action from 'mail.action.define';

export default action({
    name: 'MessagingInitializer/stop',
    id: 'mail.models.MessagingInitializer.actions.stop',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {MessagingInitializer} messagingInitializer
     */
    func(
        { ctx, env },
        messagingInitializer,
    ) {
        env.services.action.dispatch(
            'Device/stop',
            messagingInitializer.messaging(ctx).device(ctx),
        );
    },
});