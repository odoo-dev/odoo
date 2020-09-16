/** @odoo-module alias=mail.models.MessagingMenu.fields.activeTabId **/

import attr from 'mail.model.field.attr.define';

/**
 * Tab selected in the messaging menu.
 * Either 'all', 'chat' or 'channel'.
 */
export default attr({
    name: 'activeTabId',
    id: 'mail.models.MessagingMenu.fields.activeTabId',
    global: true,
    default: 'all',
});
