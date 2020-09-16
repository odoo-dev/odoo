/** @odoo-module alias=mail.models.Follower.actions.selectSubtype **/

import action from 'mail.action.define';

export default action({
    name: 'Follower/selectSubtype',
    id: 'mail.models.Follower.actions.selectSubtype',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Follower} follower
     * @param {FollowerSubtype} subtype
     */
    func(
        { ctx, env },
        follower,
        subtype,
    ) {
        if (!follower.selectedSubtypes(ctx).includes(subtype)) {
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
        }
    },
});
