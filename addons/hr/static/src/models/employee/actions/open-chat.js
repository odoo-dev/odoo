/** @odoo-module alias=hr.models.Employee.actions.openChat **/

import action from 'mail.action.define';

/**
 * Opens a chat between the user of this employee and the current user
 * and returns it.
 *
 * If a chat is not appropriate, a notification is displayed instead.
 */
export default action({
    name: 'Employee/openChat',
    id: 'hr.models.Employee.actions.openChat',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {Employee} employee
     * @param {Object} [options] forwarded to @see `Thread/open`
     * @returns {Thread|undefined}
     */
    async func(
        { env },
        employee,
        options,
    ) {
        const chat = await env.services.action.dispatch(
            'Record/doAsync',
            employee,
            () => env.services.action.dispatch(
                'Employee/getChat',
                employee,
            ),
        );
        if (!chat) {
            return;
        }
        await env.services.action.dispatch(
            'Record/doAsync',
            employee,
            () => env.services.action.dispatch(
                'Thread/open',
                chat,
                options,
            ),
        );
        return chat;
    },
});
