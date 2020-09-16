/** @odoo-module alias=im_livechat.modelAddons.ChatWindow **/

import modelAddon from 'mail.model.addon.define';

export default modelAddon({
    modelName: 'ChatWindow',
    id: 'im_livechat.modelAddons.ChatWindow',
    global: true,
    actionAddons: [
        'im_livechat.modelAddons.ChatWindow.actionAddons.close',
    ],
});
