/** @odoo-module alias=hr.modelAddons.Partner.actionAddons.openProfile **/

import actionAddon from 'mail.action.addon.define';

/**
 * When a partner is an employee, its employee profile contains more useful
 * information to know who he is than its partner profile.
 */
export default actionAddon({
    actionName: 'Partner/openProfile',
    id: 'hr.modelAddons.Partner.actionAddons.openProfile',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {function} param0.original
     * @param {Partner} partner
     * @param {Object} options
     */
    async func(
        { ctx, env, original },
        partner,
        options,
    ) {
        if (
            !partner.employee(ctx) &&
            !partner.hasCheckedEmployee(ctx)
        ) {
            await env.services.action.dispatch(
                'Record/doAsync',
                partner,
                () => env.services.action.dispatch(
                    'Partner/checkIsEmployee',
                    partner,
                ),
            );
        }
        if (partner.employee(ctx)) {
            return env.services.action.dispatch(
                'Employee/openProfile',
                partner.employee(ctx),
            );
        }
        return original(partner, options);
    },
});
