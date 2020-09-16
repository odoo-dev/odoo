/** @odoo-module alias=mail.models.Thread.fields.onIsServerPinnedChanged **/

import attr from 'mail.model.field.attr.define';

/**
 * Not a real field, used to trigger `_onIsServerPinnedChanged` when one of
 * the dependencies changes.
 */
export default attr({
    name: 'onIsServerPinnedChanged',
    id: 'mail.models.Thread.fields.onIsServerPinnedChanged',
    global: true,
    dependencies: [
        'isServerPinned',
    ],
    /**
     * Handles change of pinned state coming from the server. Useful to
     * clear pending state once server acknowledged the change.
     * @see isPendingPinned
     *
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Thread} param0.record
     */
    compute({ ctx, env, record }) {
        if (
            record.isServerPinned(ctx) ===
            record.isPendingPinned(ctx)
        ) {
            env.services.action.dispatch(
                'Record/update',
                record,
                {
                    isPendingPinned: env.services.action.dispatch(
                        'RecordFieldCommand/clear',
                    ),
                },
            );
        }
    },
});
