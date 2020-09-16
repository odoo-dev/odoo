/** @odoo-module alias=mail.models.Partner.actions.checkIsUser **/

import action from 'mail.model.define';

/**
 * Checks whether this partner has a related user and links them if
 * applicable.
 */
export default action({
    name: 'Partner/checkIsUser',
    id: 'mail.models.Partner.actions.checkIsUser',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Partner} partner
     */
    async func(
        { ctx, env },
        partner,
    ) {
        const userIds = await env.services.action.dispatch(
            'Record/doAsync',
            partner,
            () => env.services.rpc({
                model: 'res.users',
                method: 'search',
                args: [[['partner_id', '=', partner.id(ctx)]]],
                kwargs: {
                    context: { active_test: false },
                },
            }, { shadow: true }),
        );
        env.services.action.dispatch(
            'Record/update',
            partner,
            { hasCheckedUser: true },
        );
        if (userIds.length > 0) {
            env.services.action.dispatch(
                'Record/update',
                partner,
                {
                    user: env.services.action.dispatch(
                        'RecordFieldCommand/insert',
                        { id: userIds[0] },
                    ),
                },
            );
        }
    },
});
