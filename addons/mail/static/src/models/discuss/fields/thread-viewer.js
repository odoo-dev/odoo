/** @odoo-module alias=mail.models.Discuss.fields.threadViewer **/

import one2one from 'mail.model.field.one2one.define';

/**
 * Determines the `ThreadViewer` managing the display of `this.thread`.
 */
export default one2one({
    name: 'threadViewer',
    id: 'mail.models.Discuss.fields.threadViewer',
    global: true,
    target: 'ThreadViewer',
    isCausal: true,
    readonly: true,
    inverse: 'discuss',
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @returns {ThreadViewer}
     */
    default({ env }) {
        return env.services.action.dispatch(
            'RecordFieldCommand/create',
        );
    },
});
