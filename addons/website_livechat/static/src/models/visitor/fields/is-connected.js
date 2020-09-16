/** @odoo-module alias=website_livechat.models.Visitor.fields.isConnected **/

import attr from 'mail.model.field.attr.define';

/**
 * Determine whether the visitor is connected or not.
 */
export default attr({
    name: 'isConnected',
    id: 'website_livechat.models.Visitor.fields.isConnected',
    global: true,
});
