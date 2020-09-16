/** @odoo-module alias=mail.models.Chatter.fields.threadViewer **/

import one2one from 'mail.model.fields.one2one.define';

/**
 * Determines the `ThreadViewer` managing the display of `this.thread`.
 */
export default one2one({
    name: 'threadViewer',
    id: 'mail.models.Chatter.fields.threadViewer',
    global: true,
    target: 'ThreadViewer',
    inverse: 'chatter',
    isCausal: true,
    readonly: true,
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
