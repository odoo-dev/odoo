/** @odoo-module alias=mail.models.Activity.actions.deleteServerRecord **/

import action from 'mail.action.define';

export default action({
    name: 'Activity/deleteServerRecord',
    id: 'mail.models.Activity.actions.deleteServerRecord',
    global: true,
    /**
     * Delete the record from database and locally.
     *
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Activity} activity
     */
    async func(
        { ctx, env },
        activity,
    ) {
        await env.services.action.dispatch(
            'Record/doAsync',
            activity,
            () => env.services.rpc({
                model: 'mail.activity',
                method: 'unlink',
                args: [[activity.id(ctx)]],
            }),
        );
        env.services.action.dispatch(
            'Record/delete',
            activity,
        );
    },
});
