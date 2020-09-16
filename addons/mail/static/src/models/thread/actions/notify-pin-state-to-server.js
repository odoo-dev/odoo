/** @odoo-module alias=mail.models.Thread.actions.notifyPinStateToServer **/

import action from 'mail.action.define';

/**
 * Notify server to leave the current channel. Useful for cross-tab
 * and cross-device chat window state synchronization.
 *
 * Only makes sense if isPendingPinned is set to the desired value.
 */
export default action({
    name: 'Thread/notifyPinStateToServer',
    id: 'mail.models.Thread.actions.notifyPinStateToServer',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Thread} thread
     */
    async func(
        { ctx, env },
        thread,
    ) {
        if (thread.isPendingPinned(ctx)) {
            await env.services.action.dispatch(
                'Thread/performRpcChannelPin',
                {
                    pinned: true,
                    uuid: thread.uuid(ctx),
                },
            );
        } else {
            env.services.action.dispatch(
                'Thread/performRpcExecuteCommand',
                {
                    channelId: thread.id(ctx),
                    command: 'leave',
                },
            );
        }
    },
});
