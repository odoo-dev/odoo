/** @odoo-module alias=website_livechat.models.Visitor.fields.history **/

import attr from 'mail.model.field.attr.define';

/**
 * Browsing history of the visitor as a string.
 */
export default attr({
    name: 'history',
    id: 'website_livechat.models.Visitor.fields.history',
    global: true,
});
