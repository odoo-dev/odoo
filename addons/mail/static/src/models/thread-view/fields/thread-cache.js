/** @odoo-module alias=mail.models.ThreadView.fields.threadCache **/

import many2one from 'mail.model.field.many2one.define';

/**
 * States the `ThreadCache` currently displayed by `this`.
 */
export default many2one({
    name: 'threadCache',
    id: 'mail.models.ThreadView.fields.threadCache',
    global: true,
    target: 'ThreadCache',
    inverse: 'threadViews',
    related: 'threadViewer.threadCache',
});
