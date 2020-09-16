/** @odoo-module alias=im_livechat.modelAddons.Thread **/

import modelAddon from 'mail.model.addon.define';

export default modelAddon({
    modelName: 'Thread',
    id: 'im_livechat.modelAddons.Thread',
    global: true,
    actionAddons: [
        'im_livechat.modelAddons.Thread.actionAddons.convertData',
    ],
    fieldAddons: [
        'im_livechat.modelAddons.Thread.fieldAddons.correspondent',
        'im_livechat.modelAddons.Thread.fieldAddons.displayName',
        'im_livechat.modelAddons.Thread.fieldAddons.isChatChannel',
    ],
});
