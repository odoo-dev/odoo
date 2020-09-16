/** @odoo-module alias=hr.models.Employee.actions.getChat **/

import action from 'mail.action.define';

/**
 * Gets the chat between the user of this employee and the current user.
 *
 * If a chat is not appropriate, a notification is displayed instead.
 */
export default action({
    name: 'Employee/getChat',
    id: 'hr.models.Employee.actions.getChat',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Employee} employee
     * @returns {Thread|undefined}
     */
    async func(
        { ctx, env },
        employee,
    ) {
        if (!employee.user(ctx) && !employee.hasCheckedUser(ctx)) {
            await env.services.action.dispatch(
                'Record/doAsync',
                employee,
                () => env.services.action.dispatch(
                    'Employee/checkIsUser',
                    employee,
                ),
            );
        }
        // prevent chatting with non-users
        if (!employee.user(ctx)) {
            env.services['notification'].notify({
                message: env._t("You can only chat with employees that have a dedicated user."),
                type: 'info',
            });
            return;
        }
        return env.services.action.dispatch(
            'User/getChat',
            employee.user(ctx),
        );
    },
});
