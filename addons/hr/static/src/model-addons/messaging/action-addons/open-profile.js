/** @odoo-module alias=hr.modelAddons.Messaging.actionAddons.openProfile **/

import actionAddon from 'mail.action.addon.define';

export default actionAddon({
    actionName: 'Messaging/openProfile',
    id: 'hr.modelAddons.Messaging.actionAddons.openProfile',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {function} param0.original
     * @param {Object} param1
     * @param {integer} param1.id
     * @param {string} param1.model
     */
    async func(
        { env, original },
        {
            id,
            model,
        },
    ) {
        if (model === 'hr.employee' || model === 'hr.employee.public') {
            const employee = env.services.action.dispatch(
                'Employee/insert',
                { id },
            );
            return env.services.action.dispatch(
                'Employee/openProfile',
                employee,
            );
        }
        return original(...arguments);
    },
});
