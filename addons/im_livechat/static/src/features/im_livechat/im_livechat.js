/** @odoo-module alias=im_livechat.features.im_livechat **/

import feature from 'mail.feature.define';

export default feature({
    name: 'im_livechat',
    id: 'im_livechat.features.im_livechat',
    global: true,
    resources: [
        'im_livechat.modelAddons.ChatWindow',
        'im_livechat.modelAddons.MessagingInitializer',
        'im_livechat.modelAddons.MessagingNotificationHandler',
        'im_livechat.modelAddons.Partner',
        'im_livechat.modelAddons.Thread',
    ],
});
