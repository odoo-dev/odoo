/** @odoo-module alias=mail.models.Thread.fields.futureActivities **/

import one2many from 'mail.model.field.one2many.define';

/**
 * States the `Activity` that belongs to `this` and that are
 * planned in the future (due later than today).
 */
export default one2many({
    name: 'futureActivities',
    id: 'mail.models.Thread.fields.futureActivities',
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
                activity => activity.state(ctx) === 'planned',
            ),
        );
    },
});
