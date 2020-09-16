/** @odoo-module alias=mail.models.ThreadViewer.fields.thread **/

import many2one from 'mail.model.field.many2one.define';

/**
 * Determines the `Thread` that should be displayed by `this`.
 */
export default many2one({
    name: 'thread',
    id: 'mail.models.ThreadViewer.fields.thread',
    global: true,
    target: 'Thread',
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {ThreadViewer} param0.record
     * @returns {Thread|undefined}
     */
    compute({ ctx, env, record }) {
        if (record.chatter(ctx)) {
            if (!record.chatter(ctx).thread(ctx)) {
                return env.services.action.dispatch(
                    'RecordFieldCommand/unlink',
                );
            }
            return env.services.action.dispatch(
                'RecordFieldCommand/link',
                record.chatter(ctx).thread(ctx),
            );
        }
        if (record.chatWindow(ctx)) {
            if (!record.chatWindow(ctx).thread(ctx)) {
                return env.services.action.dispatch(
                    'RecordFieldCommand/unlink',
                );
            }
            return env.services.action.dispatch(
                'RecordFieldCommand/link',
                record.chatWindow(ctx).thread(ctx)
            );
        }
        if (record.discuss(ctx)) {
            if (!record.discuss(ctx).thread(ctx)) {
                return env.services.action.dispatch(
                    'RecordFieldCommand/unlink',
                );
            }
            return env.services.action.dispatch(
                'RecordFieldCommand/link',
                record.discuss(ctx).thread(ctx)
            );
        }
        return [];
    },
});
