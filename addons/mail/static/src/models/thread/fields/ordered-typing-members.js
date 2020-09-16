/** @odoo-module alias=mail.models.Thread.fields.orderedTypingMembers **/

import many2many from 'mail.model.field.many2many.define';

/**
 * Ordered typing members on this thread. Lower index means this member
 * is currently typing for the longest time. This list includes current
 * partner as typer.
 */
export default many2many({
    name: 'orderedTypingMembers',
    id: 'mail.models.Thread.fields.orderedTypingMembers',
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
            record.orderedTypingMemberLocalIds(ctx)
                .map(
                    localId => env.services.action.dispatch(
                        'Record/get',
                        localId,
                    ),
                )
                .filter(member => !!member),
        );
    },
});
