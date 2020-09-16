/** @odoo-module alias=mail.models.Thread.fields.todayActivities **/

import one2many from 'mail.model.field.one2many.define';

/**
 * States the `Activity` that belongs to `this` and that are due
 * specifically today.
 */
export default one2many({
    name: 'todayActivities',
    id: 'mail.models.Thread.fields.todayActivities',
    global: true,
    target: 'Activity',
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Thread} param0.record
     * @returns {Activity[]}
     */
    compute({ ctx, env, record }) {
        return env.services.action.dispatch(
            'RecordFieldCommand/replace',
            record.activities(ctx).filter(
                activity => activity.state(ctx) === 'today',
            ),
        );
    },
});
