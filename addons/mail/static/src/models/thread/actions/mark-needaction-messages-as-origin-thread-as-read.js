/** @odoo-module alias=mail.models.Thread.actions.markNeedactionMessagesAsOriginThreadAsRead **/

import action from 'mail.action.define';

/**
 * Mark as read all needaction messages with this thread as origin.
 */
export default action({
    name: 'Thread/markNeedactionMessagesAsOriginThreadAsRead',
    id: 'mail.models.Thread.actions.markNeedactionMessagesAsOriginThreadAsRead',
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
        await env.services.action.dispatch(
            'Record/doAsync',
            thread,
            () => env.services.action.dispatch(
                'Message/markMessagesAsRead',
                thread.needactionMessagesAsOriginThread(ctx),
            ),
        );
    },
});
