/** @odoo-module alias=mail.models.ChatWindow.fields.threadViewer **/

import one2one from 'mail.model.field.one2one.define';

/**
 * Determines the `ThreadViewer` managing the display of `this.thread`.
 */
export default one2one({
    name: 'threadViewer',
    id: 'mail.models.ChatWindow.fields.threadViewer',
    global: true,
    target: 'ThreadViewer',
    inverse: 'chatWindow',
    isCausal: true,
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
