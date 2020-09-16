/** @odoo-module alias=mail.models.ThreadView.fields.stringifiedDomain **/

import attr from 'mail.model.field.attr.define';

/**
 * Determines the domain to apply when fetching messages for `this.thread`.
 */
export default attr({
    name: 'stringifiedDomain',
    id: 'mail.models.ThreadView.fields.stringifiedDomain',
    global: true,
    related: 'threadViewer.stringifiedDomain',
});
