/** @odoo-module alias=snailmail.modelAddons.Messaging.actions.fetchSnailmailCreditsUrl **/

import action from 'mail.action.define';

export default action({
    name: 'Messaging/fetchSnailmailCreditsUrl',
    id: 'snailmail.modelAddons.Messaging.actions.fetchSnailmailCreditsUrl',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {Messaging} messaging
     */
    async func(
        { env },
        messaging,
    ) {
        const snailmailCreditsUrl = await env.services.action.dispatch(
            'Record/doAsync',
            messaging,
            () => env.services.rpc({
                model: 'iap.account',
                method: 'get_credits_url',
                args: ['snailmail'],
            }),
        );
        env.services.action.dispatch(
            'Record/update',
            messaging,
            { snailmailCreditsUrl },
        );
    },
});
