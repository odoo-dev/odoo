/** @odoo-module alias=hr.modelAddons.Messaging.actionAddons.getChat **/

import actionAddon from 'mail.action.addon.define';

export default actionAddon({
    actionName: 'Messaging/getChat',
    id: 'hr.modelAddons.Messaging.actionAddons.getChat',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {function} param0.original
     * @param {Object} param1
     * @param {integer} [param1.employeeId]
     */
    async func(
        { env, original },
        { employeeId },
    ) {
        if (employeeId) {
            const employee = env.services.action.dispatch(
                'Employee/insert',
                { id: employeeId },
            );
            return env.services.action.dispatch(
                'Employee/getChat',
                employee,
            );
        }
        return original(...arguments);
    },
});
