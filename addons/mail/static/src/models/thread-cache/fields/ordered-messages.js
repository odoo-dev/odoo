/** @odoo-module alias=mail.models.ThreadCache.fields.orderedMessages **/

import many2many from 'mail.model.field.many2many.define';

/**
 * Ordered list of messages linked to this cache.
 */
export default many2many({
    name: 'orderedMessages',
    id: 'mail.models.ThreadCache.fields.orderedMessages',
    global: true,
    target: 'Message',
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {ThreadCache} param0.record
     * @returns {Message[]}
     */
    compute({ ctx, env, record }) {
        return env.services.action.dispatch(
            'RecordFieldCommand/replace',
            record.messages(ctx).sort(
                (m1, m2) => m1.id(ctx) < m2.id(ctx) ? -1 : 1,
            ),
        );
    },
});
