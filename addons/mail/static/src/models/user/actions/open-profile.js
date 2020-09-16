/** @odoo-module alias=mail.models.User.actions.openProfile **/

import action from 'mail.action.define';

/**
 * Opens the most appropriate view that is a profile for this user.
 * Because user is a rather technical model to allow login, it's the
 * partner profile that contains the most useful information.
 */
export default action({
    name: 'User/openProfile',
    id: 'mail.models.User.actions.openProfile',
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
        if (!user.partner(ctx)) {
            await env.services.action.dispatch(
                'Record/doAsync',
                user,
                () => env.services.action.dispatch(
                    'User/fetchPartner',
                    user,
                ),
            );
        }
        if (!user.partner(ctx)) {
            // This user has been deleted from the server or never existed:
            // - Validity of id is not verified at insert.
            // - There is no bus notification in case of user delete from
            //   another tab or by another user.
            env.services['notification'].notify({
                message: env._t("You can only open the profile of existing users."),
                type: 'warning',
            });
            return;
        }
        return env.services.action.dispatch(
            'Partner/openProfile',
            user.partner(ctx),
        );
    },
});
