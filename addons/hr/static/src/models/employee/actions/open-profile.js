/** @odoo-module alias=hr.models.Employee.actions.openProfile **/

import action from 'mail.action.define';

/**
 * Opens the most appropriate view that is a profile for this employee.
 */
export default action({
    name: 'Employee/openProfile',
    id: 'hr.models.Employee.actions.openProfile',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Employee} employee
     */
    async func(
        { ctx, env },
        employee,
    ) {
        return env.services.action.dispatch(
            'Messaging/openDocument',
            {
                id: employee.id(ctx),
                model: 'hr.employee.public',
            },
        );
    },
});
