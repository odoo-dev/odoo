/** @odoo-module alias=mail.models.Discuss.fields.stringifiedDomain **/

import attr from 'mail.model.field.attr.define';

/**
 * Determines the domain to apply when fetching messages for `this.thread`.
 * This value should only be written by the control panel.
 */
export default attr({
    name: 'stringifiedDomain',
    id: 'mail.models.Discuss.fields.stringifiedDomain',
    global: true,
    default: '[]',
});
