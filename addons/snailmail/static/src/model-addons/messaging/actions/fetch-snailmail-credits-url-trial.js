/** @odoo-module alias=snailmail.modelAddons.Messaging.actions.fetchSnailmailCreditsUrlTrial **/

import action from 'mail.action.define';

export default action({
    name: 'Messaging/fetchSnailmailCreditsUrlTrial',
    id: 'snailmail.modelAddons.Messaging.actions.fetchSnailmailCreditsUrlTrial',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {Mssaging} messaging
     */
    async func(
        { env },
        messaging,
    ) {
        const snailmailCreditsUrlTrial = await env.services.action.dispatch(
            'Record/doAsync',
            messaging,
            () => env.services.rpc({
                model: 'iap.account',
                method: 'get_credits_url',
                args: ['snailmail', '', 0, true],
            }),
        );
        env.services.action.dispatch(
            'Record/update',
            messaging,
            { snailmailCreditsUrlTrial },
        );
    },
});
