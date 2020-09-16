/** @odoo-module alias=snailmail.modelAddons.Messaging **/

import modelAddon from 'mail.model.addon.define';

export default modelAddon({
    modelName: 'Messaging',
    id: 'snailmail.modelAddons.Messaging',
    global: true,
    actions: [
        'snailmail.modelAddons.Messaging.actions.fetchSnailmailCreditsUrl',
        'snailmail.modelAddons.Messaging.actions.fetchSnailmailCreditsUrlTrial',
    ],
    fields: [
        'snailmail.modelAddons.Messaging.fields.snailmailCreditsUrl',
        'snailmail.modelAddons.Messaging.fields.snailmailCreditsUrlTrial',
    ],
});
