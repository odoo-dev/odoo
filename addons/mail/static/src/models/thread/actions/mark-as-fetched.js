/** @odoo-module alias=mail.models.Thread.actions.markAsFetched **/

import action from 'mail.action.define';

/**
 * Mark the specified conversation as fetched.
 */
export default action({
    name: 'Thread/markAsFetched',
    id: 'mail.models.Thread.actions.markAsFetched',
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
            () => env.services.rpc({
                model: 'mail.channel',
                method: 'channel_fetched',
                args: [[thread.id(ctx)]],
            }, { shadow: true }),
        );
    },
});
