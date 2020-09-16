/** @odoo-module alias=sms.modelAddons.NotificationGroup **/

import modelAddon from 'mail.model.addon.define';

export default modelAddon({
    modelName: 'NotificationGroup',
    id: 'sms.modelAddons.NotificationGroup',
    global: true,
    actionAddons: [
        'sms.modelAddons.NotificationGroup.actionAddons._openDocuments',
        'sms.modelAddons.NotificationGroup.actionAddons.openCancelAction',
    ],
});
