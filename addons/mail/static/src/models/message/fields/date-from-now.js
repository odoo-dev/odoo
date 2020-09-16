/** @odoo-module alias=mail.models.Message.fields.dateFromNow **/

import attr from 'mail.model.field.attr.define';
import timeFromNow from 'mail.utils.timeFromNow';

/**
 * States the time elapsed since date up to now.
 */
export default attr({
    name: 'dateFromNow',
    id: 'mail.models.Message.fields.dateFromNow',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Message} param0.record
     * @returns {string}
     */
    compute({ ctx, env, record }) {
        if (!record.date(ctx)) {
            return env.services.action.dispatch(
                'RecordFieldCommand/clear',
            );
        }
        return timeFromNow(record.date(ctx));
    },
});
