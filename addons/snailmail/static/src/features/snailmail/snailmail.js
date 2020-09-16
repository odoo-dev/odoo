/** @odoo-module alias=snailmail.features.snailmail **/

import feature from 'mail.feature.define';

export default feature({
    name: 'snailmail',
    id: 'snailmail.features.snailmail',
    global: true,
    resources: [
        'snailmail.modelAddons.Message',
        'snailmail.modelAddons.Messaging',
        'snailmail.modelAddons.NotificationGroup',
    ],
});
