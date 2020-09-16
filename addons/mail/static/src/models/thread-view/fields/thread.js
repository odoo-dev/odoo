/** @odoo-module alias=mail.models.ThreadView.fields.thread **/

import many2one from 'mail.model.field.many2one.define';

/**
 * Determines the `Thread` currently displayed by `this`.
 */
export default many2one({
    name: 'thread',
    id: 'mail.models.ThreadView.fields.thread',
    global: true,
    target: 'Thread',
    inverse: 'threadViews',
    related: 'threadViewer.thread',
});
