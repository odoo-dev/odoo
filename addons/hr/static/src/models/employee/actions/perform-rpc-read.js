/** @odoo-module alias=hr.models.Employee.actions.performRpcRead **/

import action from 'mail.action.define';

/**
 * Performs the `read` RPC on the `hr.employee.public`.
 */
export default action({
    name: 'Employee/performRpcRead',
    id: 'hr.models.Employee.actions.performRpcRead',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {Object} param1
     * @param {Object} param1.context
     * @param {string[]} param1.fields
     * @param {integer[]} param1.ids
     */
    async func(
        { env },
        {
            context,
            fields,
            ids,
        },
    ) {
        const dataList = await env.services.rpc({
            model: 'hr.employee.public',
            method: 'read',
            args: [ids],
            kwargs: {
                context,
                fields,
            },
        });
        env.services.action.dispatch(
            'Employee/insert',
            dataList.map(
                data => env.services.action.dispatch(
                    'Employee/convertData',
                    data,
                ),
            ),
        );
    },
});
