/** @odoo-module alias=mail_bot.modelAddons.MessagingInitializer.actions._initializeOdoobot **/

import action from 'mail.action.define';

export default action({
    name: 'MessagingInitializer/_initializeOdoobot',
    id: 'mail_bot.modelAddons.MessagingInitializer',
    global: true,
    /**
     * @private
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {MessagingInitializer} messagingInitializer
     */
    async func(
        { env },
        messagingInitializer,
    ) {
        const data = await env.services.action.dispatch(
            'Record/doAsync',
            messagingInitializer,
            () => env.services.rpc({
                model: 'mail.channel',
                method: 'init_odoobot',
            }),
        );
        if (!data) {
            return;
        }
        env.session.odoobot_initialized = true;
    },
});
