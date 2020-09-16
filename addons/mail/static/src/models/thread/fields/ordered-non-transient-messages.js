/** @odoo-module alias=mail.models.Thread.fields.orderedNonTransientMessages **/

import many2many from 'mail.model.field.many2many.define';

/**
 * All messages ordered like they are displayed. This field does not
 * contain transient messages which are not "real" records.
 */
export default many2many({
    name: 'orderedNonTransientMessages',
    id: 'mail.models.Thread.fields.orderedNonTransientMessages',
    global: true,
    target: 'Message',
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Thread} param0.record
     * @returns {Message[]}
     */
    compute({ ctx, env, record }) {
        return env.services.action.dispatch(
            'RecordFieldCommand/replace',
            record.orderedMessages(ctx).filter(
                m => !m.isTransient(ctx),
            ),
        );
    },
});
