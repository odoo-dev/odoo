/** @odoo-module alias=hr.models.Employee.actions.performRpcSearchRead **/

import action from 'mail.action.define';

/**
 * Performs the `search_read` RPC on `hr.employee.public`.
 */
export default action({
    name: 'Employee/performRpcSearchRead',
    id: 'hr.models.Employee.actions.performRpcSearchRead',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {Object} param1
     * @param {Object} param1.context
     * @param {Array[]} param1.domain
     * @param {string[]} param1.fields
     */
    async func(
        { env },
        {
            context,
            domain,
            fields,
        },
    ) {
        const dataList = await env.services.rpc({
            model: 'hr.employee.public',
            method: 'search_read',
            kwargs: {
                context,
                domain,
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
