/** @odoo-module alias=mail.models.Activity.actions.markAsDoneAndScheduleNext **/

import action from 'mail.action.define';

export default action({
    name: 'Activity/markAsDoneAndScheduleNext',
    id: 'mail.models.Activity.actions.markAsDoneAndScheduleNext',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Activity} activity
     * @param {Object} param2
     * @param {string} param2.feedback
     * @returns {Object}
     */
    async func(
        { ctx, env },
        activity,
        { feedback },
    ) {
        const action = await env.services.action.dispatch(
            'Record/doAsync',
            activity,
            () => env.services.rpc({
                model: 'mail.activity',
                method: 'action_feedback_schedule_next',
                args: [[activity.id(ctx)]],
                kwargs: { feedback },
            }),
        );
        env.services.action.dispatch(
            'Thread/refresh',
            activity.thread(ctx),
        );
        const thread = activity.thread(ctx);
        env.services.action.dispatch(
            'Record/delete',
            activity,
        );
        if (!action) {
            env.services.action.dispatch(
                'Thread/refreshActivities',
                thread,
            );
            return;
        }
        env.bus.trigger('do-action', {
            action,
            options: {
                on_close: () => {
                    env.services.action.dispatch(
                        'Thread/refreshActivities',
                        thread,
                    );
                },
            },
        });
    },
});
