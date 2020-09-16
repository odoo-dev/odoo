/** @odoo-module alias=mail.models.Thread.actions.performRpcMessagePost **/

import action from 'mail.action.define';

/**
 * Performs the `message_post` RPC on given threadModel.
 */
export default action({
    name: 'Thread/performRpcMessagePost',
    id: 'mail.models.Thread.actions.performRpcMessagePost',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {Object} param1
     * @param {Object} param1.postData
     * @param {integer} param1.threadId
     * @param {string} param1.threadModel
     * @return {integer} the posted message id
     */
    async func(
        { env },
        {
            postData,
            threadId,
            threadModel,
        }
    ) {
        return env.services.rpc({
            model: threadModel,
            method: 'message_post',
            args: [threadId],
            kwargs: postData,
        });
    },
});
