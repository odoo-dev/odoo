/** @odoo-module alias=mail.models.Activity.actions.markAsDone **/

import action from 'mail.action.define';

export default action({
    name: 'Activity/markAsDone',
    id: 'mail.models.Activity.actions.markAsDone',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Activity} activity
     */
    async func(
        { ctx, env },
        activity,
    ) {
        const [data] = await env.services.action.dispatch(
            'Record/doAsync',
            activity,
            () => env.services.rpc({
                model: 'mail.activity',
                method: 'activity_format',
                args: [activity.id(ctx)],
            }, { shadow: true }),
        );
        let shouldDelete = false;
        if (data) {
            env.services.action.dispatch(
                'Record/update',
                activity,
                env.services.action.dispatch(
                    'Activity/convertData',
                    data,
                ),
            );
        } else {
            shouldDelete = true;
        }
        env.services.action.dispatch(
            'Thread/refreshActivities',
            activity.thread(ctx),
        );
        env.services.action.dispatch(
            'Thread/refresh',
            activity.thread(ctx),
        );
        if (shouldDelete) {
            env.services.action.dispatch(
                'Record/delete',
                activity,
            );
        }
    },
});
