/** @odoo-module alias=mail.models.Thread.actions.notifyFoldStateToServer **/

import action from 'mail.action.define';

/**
 * Notifies the server of new fold state. Useful for initial,
 * cross-tab, and cross-device chat window state synchronization.
 */
export default action({
    name: 'Thread/notifyFoldStateToServer',
    id: 'mail.models.Thread.actions.notifyFoldStateToServer',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Thread} thread
     * @param {string} state
     */
    async func(
        { ctx, env },
        thread,
        state,
    ) {
        if (thread.model(ctx) !== 'mail.channel') {
            // Server sync of fold state is only supported for channels.
            return;
        }
        if (!thread.uuid(ctx)) {
            return;
        }
        return env.services.action.dispatch(
            'Thread/performRpcChannelFold',
            thread.uuid(ctx),
            state,
        );
    },
});
