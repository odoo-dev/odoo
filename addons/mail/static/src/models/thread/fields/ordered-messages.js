/** @odoo-module alias=mail.models.Thread.fields.orderedMessages **/

import many2many from 'mail.model.field.many2many.define';

/**
 * All messages ordered like they are displayed.
 */
export default many2many({
    name: 'orderedMessages',
    id: 'mail.models.Thread.fields.orderedMessages',
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
            record.messages(ctx).sort(
                (m1, m2) => (
                    m1.id(ctx) < m2.id(ctx)
                    ? -1
                    : 1
                ),
            ),
        );
    },
});
