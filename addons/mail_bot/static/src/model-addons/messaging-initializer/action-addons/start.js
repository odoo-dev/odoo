/** @odoo-module alias=mail_bot.modelAddons.MessagingInitializer.actionAddons.start **/

import actionAddon from 'mail.action.addon.define';

export default actionAddon({
    actionName: 'MessagingInitializer/start',
    id: 'mail_bot.modelAddons.MessagingInitializer.actionAddons.start',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {function} param0.original
     */
    async func(
        { env, original },
        messagingInitializer,
    ) {
        await env.services.action.dispatch(
            'Record/doAsync',
            messagingInitializer,
            () => original(...arguments),
        );
        if (
            'odoobot_initialized' in env.session &&
            !env.session.odoobot_initialized
        ) {
            env.services.action.dispatch(
                'MessagingInitializer/_initializeOdoobot',
                messagingInitializer,
            );
        }
    },
});
