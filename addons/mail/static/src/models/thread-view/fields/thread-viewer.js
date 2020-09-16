/** @odoo-module alias=mail.models.ThreadView.fields.threadViewer **/

import one2one from 'mail.model.field.one2one.define';

/**
 * Determines the `ThreadViewer` currently managing `this`.
 */
export default one2one({
    name: 'threadViewer',
    id: 'mail.models.ThreadView.fields.threadViewer',
    global: true,
    target: 'ThreadView',
    inverse: 'threadView',
});
