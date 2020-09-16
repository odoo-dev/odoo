/** @odoo-module alias=mail.models.Thread.fields.orderedOtherTypingMembers **/

import many2many from 'mail.model.field.many2many.define';

/**
 * Ordered typing members on this thread, excluding the current partner.
 */
export default many2many({
    name: 'orderedOtherTypingMembers',
    id: 'mail.models.Thread.fields.orderedOtherTypingMembers',
    global: true,
    target: 'Partner',
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Thread} param0.record
     * @returns {Partner[]}
     */
    compute({ ctx, env, record }) {
        return env.services.action.dispatch(
            'RecordFieldCommand/replace',
            record.orderedTypingMembers(ctx).filter(
                member => member !== env.services.model.messaging.currentPartner(ctx),
            ),
        );
    },
});
