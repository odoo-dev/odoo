/** @odoo-module alias=mail.models.NotificationGroup.fields.thread **/

import many2one from 'mail.model.field.many2one.define';

/**
 * Related thread when the notification group concerns a single thread.
 */
export default many2one({
    name: 'thread',
    id: 'mail.models.NotificationGroup.fields.thread',
    global: true,
    target: 'Thread',
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {NotificationGroup} param0.record
     * @returns {Thread|undefined}
     */
    compute({ ctx, env, record }) {
        if (record.resId(ctx)) {
            return env.services.action.dispatch(
                'RecordFieldCommand/insert',
                {
                    id: record.resId(ctx),
                    model: record.resModel(ctx),
                },
            );
        }
        return env.services.action.dispatch(
            'RecordFieldCommand/unlink',
        );
    },
});
