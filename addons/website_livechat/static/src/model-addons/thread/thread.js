/** @odoo-module alias=website_livechat.modelAddons.Thread **/

import modelAddon from 'mail.model.addon.define';

export default modelAddon({
    modelName: 'Thread',
    id: 'website_livechat.modelAddons.Thread',
    global: true,
    actionAddons: [
        'website_livechat.modelAddons.Thread.actionAddons.convertData',
    ],
    fields: [
        'website_livechat.modelAddons.Thread.fields.visitor',
    ],
});
