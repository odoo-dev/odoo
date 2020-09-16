/** @odoo-module alias=mail.models.ThreadViewer.fields.threadView **/

import one2one from 'mail.model.field.one2one.define';

/**
 * States the `ThreadView` currently displayed and managed by `this`.
 */
export default one2one({
    name: 'threadView',
    id: 'mail.models.ThreadViewer.fields.threadView',
    global: true,
    target: 'ThreadView',
    inverse: 'threadViewer',
    isCausal: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {ThreadViewer} param0.record
     * @returns {ThreadView|undefined}
     */
    compute({ ctx, env, record }) {
        if (!record.hasThreadView(ctx)) {
            return env.services.action.dispatch(
                'RecordFieldCommand/unlink',
            );
        }
        if (record.threadView(ctx)) {
            return [];
        }
        return env.services.action.dispatch(
            'RecordFieldCommand/create',
        );
    },
});
