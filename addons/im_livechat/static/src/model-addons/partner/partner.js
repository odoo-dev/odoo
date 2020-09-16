/** @odoo-module alias=im_livechat.modelAddons.Partner **/

import modelAddon from 'mail.model.addon.define';

export default modelAddon({
    modelName: 'Partner',
    id: 'im_livechat.modelAddons.Partner',
    global: true,
    actions: [
        'im_livechat.modelAddons.Partner.actions.getNextPublicId',
    ],
});
