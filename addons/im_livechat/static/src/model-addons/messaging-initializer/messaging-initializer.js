/** @odoo-module alias=im_livechat.modelAddons.MessagingInitializer **/

import modelAddon from 'mail.model.addon.define';

export default modelAddon({
    modelName: 'MessagingInitializer',
    id: 'im_livechat.modelAddons.MessagingInitializer',
    global: true,
    actionAddons: [
        'im_livechat.modelAddons.MessagingInitializer.actionAddons._initChannels',
    ],
});
