/** @odoo-module alias=website_livechat.modelAddons.MessagingNotificationHandler **/

import modelAddon from 'mail.model.addon.define';

export default modelAddon({
    modelName: 'MessagingNotificationHandler',
    id: 'website_livechat.modelAddons.MessagingNotificationHandler',
    global: true,
    actionAddons: [
        'website_livechat.modelAddons.MessagingNotificationHandler.actionAddons._handleNotificationPartner',
    ],
});
