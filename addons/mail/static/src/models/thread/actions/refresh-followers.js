/** @odoo-module alias=mail.models.Thread.actions.refreshFollowers **/

import action from 'mail.action.define';

/**
 * Refresh followers information from server.
 */
export default action({
    name: 'Thread/refreshFollowers',
    id: 'mail.models.Thread.actions.refreshFollowers',
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
            env.services.action.dispatch(
                'Record/update',
                thread,
                {
                    followers: env.services.action.dispatch(
                        'RecordFieldCommand/unlinkAll',
                    ),
                },
            );
            return;
        }
        const { followers } = await env.services.action.dispatch(
            'Record/doAsync',
            thread,
            () => env.services.rpc({
                route: '/mail/read_followers',
                params: {
                    res_id: thread.id(ctx),
                    res_model: thread.model(ctx),
                },
            }, { shadow: true }),
        );
        env.services.action.dispatch(
            'Record/update',
            thread,
            { areFollowersLoaded: true },
        );
        if (followers.length > 0) {
            env.services.action.dispatch(
                'Record/update',
                thread,
                {
                    followers: env.services.action.dispatch(
                        'RecordFieldCommand/insertAndReplace',
                        followers.map(
                            data => env.services.action.dispatch(
                                'Follower/convertData',
                                data,
                            ),
                        ),
                    ),
                },
            );
        } else {
            env.services.action.dispatch(
                'Record/update',
                thread,
                {
                    followers: env.services.action.dispatch(
                        'RecordFieldComand/unlinkAll',
                    ),
                },
            );
        }
    },
});
