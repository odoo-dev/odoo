/** @odoo-module alias=mail.models.User.actions.performRpcRead **/

import action from 'mail.action.define';

/**
 * Performs the `read` RPC on `res.users`.
 */
export default action({
    name: 'User/performRpcRead',
    id: 'mail.models.User.actions.performRpcRead',
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
        const usersData = await env.services.rpc({
            model: 'res.users',
            method: 'read',
            args: [ids],
            kwargs: {
                context,
                fields,
            },
        }, { shadow: true });
        return env.services.action.dispatch(
            'User/insert',
            usersData.map(
                userData => env.services.action.dispatch(
                    'User/convertData',
                    userData,
                ),
            ),
        );
    },
});
