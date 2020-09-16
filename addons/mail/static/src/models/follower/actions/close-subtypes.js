/** @odoo-module alias=mail.models.Follower.actions.closeSubtypes **/

import action from 'mail.action.define';

/**
 * Close subtypes dialog
 */
export default action({
    name: 'Follower/closeSubtypes',
    id: 'mail.models.Follower.actions.closeSubtypes',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {Follower} follower
     */
    func(
        { env },
        follower,
    ) {
        env.services.action.dispatch(
            'Record/delete',
            follower._subtypesListDialog,
        );
        follower._subtypesListDialog = undefined;
    },
});
