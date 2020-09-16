/** @odoo-module alias=mail.models.Thread.actions.rename **/

import action from 'mail.action.define';

/**
 * Rename the given thread with provided new name.
 */
export default action({
    name: 'Thread/rename',
    id: 'mail.models.Thread.actions.rename',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Thread} thread
     * @param {string} newName
     */
    async func(
        { ctx, env },
        thread,
        newName,
    ) {
        if (thread.channelType(ctx) === 'chat') {
            await env.services.action.dispatch(
                'Record/doAsync',
                thread,
                () => env.services.rpc({
                    model: 'mail.channel',
                    method: 'channel_set_custom_name',
                    args: [thread.id(ctx)],
                    kwargs: {
                        name: newName,
                    },
                }),
            );
        }
        env.services.action.dispatch(
            'Record/update',
            thread,
            { customChannelName: newName },
        );
    },
});
