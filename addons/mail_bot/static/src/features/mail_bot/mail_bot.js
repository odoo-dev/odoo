/** @odoo-module alias=mail_bot.features.mail_bot **/

import feature from 'mail.feature.define';

export default feature({
    name: 'mail_bot',
    id: 'mail_bot.features.mail_bot',
    global: true,
    resources: ['mail_bot.modelAddons.MessagingInitializer'],
});
