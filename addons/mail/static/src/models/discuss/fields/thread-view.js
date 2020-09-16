/** @odoo-module alias=mail.models.Discuss.fields.threadView **/

import one2one from 'mail.model.field.one2one.define';

/**
 * States the `ThreadView` displaying `this.thread`.
 */
export default one2one({
    name: 'threadView',
    id: 'mail.models.Discuss.fields.threadView',
    global: true,
    target: 'ThreadView',
    related: 'threadViewer.threadView',
});
