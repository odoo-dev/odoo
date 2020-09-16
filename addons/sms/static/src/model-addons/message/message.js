/** @odoo-module alias=sms.modelAddons.Message **/

import modelAddon from 'mail.model.addon.define';

export default modelAddon({
    modelName: 'Message',
    id: 'sms.modelAddons.Message',
    global: true,
    actionAddons: [
        'sms.modelAddons.Message.actionAddons.openResendAction',
    ],
});
