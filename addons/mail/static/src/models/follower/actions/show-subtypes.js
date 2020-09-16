/** @odoo-module alias=mail.models.Follower.actions.showSubtypes **/

import action from 'mail.action.define';

/**
 * Show (editable) list of subtypes of this follower.
 */
export default action({
    name: 'Follower/showSubtypes',
    id: 'mail.models.Follower.actions.showSubtypes',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param.ctx
     * @param {web.env} param0.env
     * @param {Follower} follower
     */
    async func(
        { ctx, env },
        follower,
    ) {
        const subtypesData = await env.services.action.dispatch(
            'Record/doAsync',
            follower,
            () => env.services.rpc({
                route: '/mail/read_subscription_data',
                params: {
                    follower_id: follower.id(ctx),
                },
            }),
        );
        env.services.action.dispatch(
            'Record/update',
            follower,
            {
                subtypes: env.services.action.dispatch(
                    'RecordFieldCommand/unlinkAll',
                ),
            },
        );
        for (const data of subtypesData) {
            const subtype = env.services.action.dispatch(
                'FollowerSubtype/insert',
                env.services.action.dispatch(
                    'FollowerSubtype/convertData',
                    data,
                ),
            );
            env.services.action.dispatch(
                'Record/update',
                follower,
                {
                    subtypes: env.services.action.dispatch(
                        'RecordFieldCommand/link',
                        subtype,
                    ),
                },
            );
            if (data.followed) {
                env.services.action.dispatch(
                    'Record/update',
                    follower,
                    {
                        selectedSubtypes: env.services.action.dispatch(
                            'RecordFieldCommand/link',
                            subtype,
                        ),
                    },
                );
            } else {
                env.services.action.dispatch(
                    'Record/update',
                    follower,
                    {
                        selectedSubtypes: env.services.action.dispatch(
                            'RecordFieldCommand/unlink',
                            subtype,
                        ),
                    },
                );
            }
        }
        follower._subtypesListDialog = env.services.action.dispatch(
            'DialogManager/open',
            env.services.model.messaging.dialogManager(ctx),
            'FollowerSubtypeList',
            {
                follower: env.services.action.dispatch(
                    'RecordFieldCommand/link',
                    follower,
                ),
            },
        );
    },
});
