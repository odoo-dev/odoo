/** @odoo-module alias=website_livechat.features.website_livechat **/

import feature from 'mail.feature.define';

export default feature({
    name: 'website_livechat',
    id: 'website_livechat.features.website_livechat',
    global: true,
    resources: [
        'website_livechat.modelAddons.MessagingNotificationHandler',
        'website_livechat.modelAddons.Thread',
        'website_livechat.models.Visitor',
    ],
});
