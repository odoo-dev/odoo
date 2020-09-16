/** @odoo-module alias=website_livechat.models.Visitor.fields.websiteName **/

import attr from 'mail.model.field.attr.define';

/**
 * Name of the website on which the visitor is connected. (Ex: "Website 1")
 */
export default attr({
    name: 'websiteName',
    id: 'website_livechat.models.Visitor.fields.websiteName',
    global: true,
});
