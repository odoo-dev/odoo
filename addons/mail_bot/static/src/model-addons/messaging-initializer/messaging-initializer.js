/** @odoo-module alias=mail_bot.modelAddons.MessagingInitializer **/

import modelAddon from 'mail.model.addon.define';

export default modelAddon({
    modelName: 'MessagingInitializer',
    id: 'mail_bot.modelAddons.MessagingInitializer',
    global: true,
    actionAddons: [
        'mail_bot.modelAddons.MessagingInitializer.actionAddons.start',
    ],
    actions: [
        'mail_bot.modelAddons.MessagingInitializer.actions._initializeOdoobot',
    ],
});
