/** @odoo-module alias=mail.models.Discuss.fields.sidebarQuickSearchValue **/

import attr from 'mail.model.field.attr.define';

/**
 * Quick search input value in the discuss sidebar (desktop). Useful
 * to filter channels and chats based on this input content.
 */
export default attr({
    name: 'sidebarQuickSearchValue',
    id: 'mail.models.Discuss.fields.sidebarQuickSearchValue',
    global: true,
    default: "",
});
