/** @odoo-module alias=mail.models.Messaging.actions.openProfile **/

import action from 'mail.action.define';

/**
 * Opens the most appropriate view that is a profile for provided id and
 * model.
 */
export default action({
    name: 'Messaging/openProfile',
    id: 'mail.models.Messaging.actions.openProfile',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {Messaging} messaging
     * @param {Object} param2
     * @param {integer} param2.id
     * @param {string} param2.model
     */
    async 'Messaging/openProfile'(
        { env },
        messaging,
        {
            id,
            model,
        },
    ) {
        if (model === 'res.partner') {
            const partner = env.services.action.dispatch(
                'Partner/insert',
                { id, },
            );
            return env.services.action.dispatch(
                'Partner/openProfile',
                partner,
            );
        }
        if (model === 'res.users') {
            const user = env.services.action.dispatch(
                'User/insert',
                { id, },
            );
            return env.services.action.dispatch(
                'User/openProfile',
                user,
            );
        }
        if (model === 'mail.channel') {
            let channel = env.services.action.dispatch(
                'Thread/findById',
                {
                    id,
                    model: 'mail.channel',
                },
            );
            if (!channel) {
                channel = (
                    await env.services.action.dispatch(
                        'Record/doAsync',
                        messaging,
                        () => env.services.action.dispatch(
                            'Thread/performRpcChannelInfo',
                            { ids: [id] },
                        ),
                    )
                )[0];
            }
            if (!channel) {
                env.services['notification'].notify({
                    message: env._t("You can only open the profile of existing channels."),
                    type: 'warning',
                });
                return;
            }
            return env.services.action.dispatch(
                'Thread/openProfile',
                channel,
            );
        }
        return env.services.action.dispatch(
            'Messaging/openDocument',
            { id, model },
        );
    },
});
