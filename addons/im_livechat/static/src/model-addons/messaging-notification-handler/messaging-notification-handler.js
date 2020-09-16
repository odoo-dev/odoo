/** @odoo-module alias=im_livechat.modelAddons.MessagingNotificationHandler **/

import modelAddon from 'mail.model.addon.define';

export default modelAddon({
    modelName: 'MessagingNotificationHandler',
    id: 'im_livechat.modelAddons.MessagingNotificationHandler',
    global: true,
    actionAddons: [
        'im_livechat.modelAddons.MessagingNotificationHandler.actionAddons._handleNotificationChannelTypingStatus',
    ],
});
