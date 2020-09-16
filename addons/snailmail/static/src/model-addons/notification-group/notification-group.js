/** @odoo-module alias=snailmail.modelAddons.NotificationGroup **/

import modelAddon from 'mail.model.addon.define';

export default modelAddon({
    modelName: 'NotificationGroup',
    id: 'snailmail.modelAddons.NotificationGroup',
    global: true,
    actionAddons: [
        'snailmail.modelAddons.NotificationGroup.actionAddons._openDocuments',
        'snailmail.modelAddons.NotificationGroup.actionAddons.openCancelAction',
    ],
});
