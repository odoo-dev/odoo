/** @odoo-module alias=mail.models.ThreadViewer.fields.threadCache **/

import many2one from 'mail.model.field.many2one.define';

/**
 * States the `ThreadCache` that should be displayed by `this`.
 */
export default many2one({
    name: 'threadCache',
    id: 'mail.models.ThreadViewer.fields.threadCache',
    global: true,
    target: 'ThreadCache',
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {ThreadViewer} param0.record
     * @returns {ThreadCache|undefined}
     */
    compute({ ctx, env, record }) {
        if (!record.thread(ctx)) {
            return env.services.action.dispatch(
                'RecordFieldCommand/unlink',
            );
        }
        return env.services.action.dispatch(
            'RecordFieldCommand/link',
            env.services.action.dispatch(
                'Thread/cache',
                record.thread(ctx),
                record.stringifiedDomain(ctx),
            ),
        );
    },
});
