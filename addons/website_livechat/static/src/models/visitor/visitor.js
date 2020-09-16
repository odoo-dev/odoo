/** @odoo-module alias=website_livechat.models.Visitor **/

import model from 'mail.model.define';

export default model({
    name: 'Visitor',
    id: 'website_livechat.models.Visitor',
    global: true,
    actions: [
        'website_livechat.models.Visitor.actions.convertData',
    ],
    fields: [
        'website_livechat.models.Visitor.fields.avatarUrl',
        'website_livechat.models.Visitor.fields.country',
        'website_livechat.models.Visitor.fields.displayName',
        'website_livechat.models.Visitor.fields.history',
        'website_livechat.models.Visitor.fields.isConnected',
        'website_livechat.models.Visitor.fields.langName',
        'website_livechat.models.Visitor.fields.nameOrDisplayName',
        'website_livechat.models.Visitor.fields.partner',
        'website_livechat.models.Visitor.fields.threads',
        'website_livechat.models.Visitor.fields.websiteName',
    ],
});
