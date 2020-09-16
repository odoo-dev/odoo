/** @odoo-module alias=hr.modelAddons.Partner.actions.checkIsEmployee **/

import action from 'mail.action.define';

/**
 * Checks whether this partner has a related employee and links them if
 * applicable.
 */
export default action({
    name: 'Partner/checkIsEmployee',
    id: 'hr.modelAddons.Partner.actions.checkIsEmployee',
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
        await env.services.action.dispatch(
            'Record/doAsync',
            partner,
            () => env.services.action.dispatch(
                'Employee/performRpcSearchRead',
                {
                    context: { active_test: false },
                    domain: [['user_partner_id', '=', partner.id(ctx)]],
                    fields: ['user_id', 'user_partner_id'],
                },
            ),
        );
        env.services.action.dispatch(
            'Record/update',
            partner,
            { hasCheckedEmployee: true },
        );
    },
});
