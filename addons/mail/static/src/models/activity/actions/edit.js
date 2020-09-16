/** @odoo-module alias=mail.models.Activity.actions.edit **/

import action from 'mail.action.define';

export default action({
    name: 'Activity/edit',
    id: 'mail.models.Activity.actions.edit',
    global: true,
    /**
     * Opens (legacy) form view dialog to edit current activity and updates
     * the activity when dialog is closed.
     *
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Activity} activity
     */
    func(
        { ctx, env },
        activity,
    ) {
        const action = {
            type: 'ir.actions.act_window',
            name: env._t("Schedule Activity"),
            res_model: 'mail.activity',
            view_mode: 'form',
            views: [[false, 'form']],
            target: 'new',
            context: {
                default_res_id: activity.thread(ctx).id(ctx),
                default_res_model: activity.thread(ctx).model(ctx),
            },
            res_id: activity.id(ctx),
        };
        env.bus.trigger('do-action', {
            action,
            options: {
                on_close: () => env.services.action.dispatch(
                    'Activity/fetchAndUpdate',
                    activity,
                ),
            },
        });
    },
});
