/** @odoo-module alias=mail.models.Partner.actions.getChat **/

import action from 'mail.model.define';

/**
 * Gets the chat between the user of this partner and the current user.
 *
 * If a chat is not appropriate, a notification is displayed instead.
 */
export default action({
    name: 'Partner/getChat',
    id: 'mail.models.Partner.actions.getChat',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Partner} partner
     * @returns {Thread|undefined}
     */
    async func(
        { ctx, env },
        partner,
    ) {
        if (
            !partner.user(ctx) &&
            !partner.hasCheckedUser(ctx)
        ) {
            await env.services.action.dispatch(
                'Record/doAsync',
                partner,
                () => env.services.action.dispatch(
                    'Partner/checkIsUser',
                    partner,
                ),
            );
        }
        // prevent chatting with non-users
        if (!partner.user(ctx)) {
            env.services['notification'].notify({
                message: env._t("You can only chat with partners that have a dedicated user."),
                type: 'info',
            });
            return;
        }
        return env.services.action.dispatch(
            'User/getChat',
            partner.user(ctx),
        );
    },
});
