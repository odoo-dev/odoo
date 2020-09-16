/** @odoo-module alias=mail.models.Follower.actions.unselectSubtype **/

import action from 'mail.action.define';

export default action({
    name: 'Follower/unselectSubtype',
    id: 'mail.models.Follower.actions.unselectSubtype',
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
        if (follower.selectedSubtypes(ctx).includes(subtype)) {
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
    },
});
