/** @odoo-module alias=mail.models.Discuss.fields.activeMobileNavbarTabId **/

import attr from 'mail.model.field.attr.define';

/**
 * Active mobile navbar tab, either 'mailbox', 'chat', or 'channel'.
 */
export default attr({
    name: 'activeMobileNavbarTabId',
    id: 'mail.models.Discuss.fields.activeMobileNavbarTabId',
    global: true,
    default: 'mailbox',
});
