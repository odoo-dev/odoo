/** @odoo-module alias=mail.models.Thread.actions.performRpcExecuteCommand **/

import action from 'mail.action.define';

/**
 * Performs the `execute_command` RPC on `mail.channel`.
 */
export default action({
    name: 'Thread/performRpcExecuteCommand',
    id: 'mail.models.Thread.actions.performRpcExecuteCommand',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {Object} param1
     * @param {integer} param1.channelId
     * @param {string} param1.command
     * @param {Object} [param1.postData={}]
     */
    async func(
        { env },
        {
            channelId,
            command,
            postData = {},
        },
    ) {
        return env.services.rpc({
            model: 'mail.channel',
            method: 'execute_command',
            args: [[channelId]],
            kwargs: {
                command,
                ...postData,
            },
        });
    },
});
