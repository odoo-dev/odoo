/** @odoo-module alias=mail.models.Follower.actions.updateSubtypes **/

import action from 'mail.action.define';

/**
 * Update server-side subscription of subtypes of this follower.
 */
export default action({
    name: 'Follower/updateSubtypes',
    id: 'mail.models.Follower.actions.updateSubtypes',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Follower} follower
     */
    async func(
        { ctx, env },
        follower,
    ) {
        if (follower.selectedSubtypes(ctx).length === 0) {
            env.services.action.dispatch(
                'Follower/remove',
                follower,
            );
        } else {
            const kwargs = {
                subtype_ids: follower.selectedSubtypes(ctx).map(
                    subtype => subtype.id(ctx),
                ),
            };
            if (follower.partner(ctx)) {
                kwargs.partner_ids = [follower.partner(ctx).id(ctx)];
            } else {
                kwargs.channel_ids = [follower.channel(ctx).id(ctx)];
            }
            await env.services.action.dispatch(
                'Record/doAsync',
                follower,
                () => env.services.rpc({
                    model: follower.followedThread(ctx).model(ctx),
                    method: 'message_subscribe',
                    args: [[follower.followedThread(ctx).id(ctx)]],
                    kwargs,
                }),
            );
            env.services['notification'].notify({
                type: 'success',
                message: env._t("The subscription preferences were successfully applied."),
            });
        }
        env.services.action.dispatch(
            'Follower/closeSubtypes',
            follower,
        );
    },
});
