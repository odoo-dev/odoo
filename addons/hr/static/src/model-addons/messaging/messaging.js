/** @odoo-module alias=hr.modelAddons.Messaging **/

import modelAddon from 'mail.model.addon.define';

export default modelAddon({
    modelName: 'Messaging',
    id: 'hr.modelAddons.Messaging',
    global: true,
    actionAddons: [
        'hr.modelAddons.Messaging.actionAddons.getChat',
        'hr.modelAddons.Messaging.actionAddons.openProfile',
    ],
});
