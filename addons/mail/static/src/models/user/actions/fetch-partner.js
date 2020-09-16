/** @odoo-module alias=mail.models.User.actions.fetchPartner **/

import action from 'mail.action.define';

/**
 * Fetches the partner of this user.
 */
export default action({
    name: 'User/fetchPartner',
    id: 'mail.models.User.actions.fetchPartner',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {User} user
     */
    async func(
        { ctx, env },
        user,
    ) {
        return env.services.action.dispatch(
            'User/performRpcRead',
            {
                context: { active_test: false },
                fields: ['partner_id'],
                ids: [user.id(ctx)],
            },
        );
    },
});
