/** @odoo-module alias=mail.models.Chatter.fields.threadView **/

import one2one from 'mail.model.fields.one2one.define';

/**
 * States the `ThreadView` displaying `this.thread`.
 */
export default one2one({
    name: 'threadView',
    id: 'mail.models.Chatter.fields.threadView',
    global: true,
    target: 'ThreadView',
    related: 'threadViewer.threadView',
});
