/** @odoo-module alias=hr.models.Employee.actions.checkIsUser **/

import action from 'mail.action.define';

/**
 * Checks whether this employee has a related user and partner and links
 * them if applicable.
 */
export default action({
    name: 'Employee/checkIsUser',
    id: 'hr.models.Employee.actions.checkIsUser',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Employee} employee
     * @returns {boolean}
     */
    async func(
        { ctx, env },
        employee,
    ) {
        return env.services.action.dispatch(
            'Employee/performRpcRead',
            {
                context: { active_test: false },
                fields: [
                    'user_id',
                    'user_partner_id',
                ],
                ids: [employee.id(ctx)],
            },
        );
    },
});
