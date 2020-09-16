/** @odoo-module alias=snailmail.modelAddons.Message **/

import modelAddon from 'mail.model.addon.define';

export default modelAddon({
    modelName: 'Message',
    id: 'snailmail.modelAddons.Message',
    global: true,
    actions: [
        'snailmail.modelAddons.Message.actions.cancelLetter',
        'snailmail.modelAddons.Message.actions.openFormatLetterAction',
        'snailmail.modelAddons.Message.actions.openMissingFieldsLetterAction',
        'snailmail.modelAddons.Message.actions.resendLetter',
    ],
});
