/** @odoo-module alias=mail.models.Thread.actions.refreshActivities **/

import action from 'mail.action.define';

export default action({
    name: 'Thread/refreshActivities',
    id: 'mail.models.Thread.actions.refreshActivities',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Thread} thread
     */
    async func(
        { ctx, env },
        thread,
    ) {
        if (!thread.hasActivities(ctx)) {
            return;
        }
        if (thread.isTemporary(ctx)) {
            return;
        }
        // A bit "extreme", may be improved
        const [{ activity_ids: newActivityIds }] = await env.services.action.dispatch(
            'Record/doAsync',
            thread,
            () => env.services.rpc({
                model: thread.model(ctx),
                method: 'read',
                args: [
                    thread.id(ctx),
                    ['activity_ids'],
                ],
            }, { shadow: true })
        );
        const activitiesData = await env.services.action.dispatch(
            'Record/doAsync',
            thread,
            () => env.services.rpc({
                model: 'mail.activity',
                method: 'activity_format',
                args: [newActivityIds]
            }, { shadow: true }),
        );
        const activities = env.services.action.dispatch(
            'Activity/insert',
            activitiesData.map(
                activityData => env.services.action.dispatch(
                    'Activity/convertData',
                    activityData,
                ),
            ),
        );
        env.services.action.dispatch(
            'Record/update',
            thread,
            {
                activities: env.services.action.dispatch(
                    'RecordFieldCommand/replace',
                    activities,
                ),
            },
        );
    },
});
