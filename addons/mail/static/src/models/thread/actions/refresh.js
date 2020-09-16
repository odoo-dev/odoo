/** @odoo-module alias=mail.models.Thread.actions.refresh **/

import action from 'mail.action.define';

export default action({
    name: 'Thread/refresh',
    id: 'mail.models.Thread.actions.refresh',
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
        if (thread.isTemporary(ctx)) {
            return;
        }
        env.services.action.dispatch(
            'Thread/loadNewMessages',
            thread,
        );
        env.services.action.dispatch(
            'Record/update',
            thread,
            { isLoadingAttachments: true },
        );
        await env.services.action.dispatch(
            'Record/doAsync',
            thread,
            () => env.services.action.dispatch(
                'Thread/fetchAttachments',
                thread,
            ),
        );
        env.services.action.dispatch(
            'Record/update',
            thread,
            { isLoadingAttachments: false },
        );
    },
});
