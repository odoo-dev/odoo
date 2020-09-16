/** @odoo-module alias=sms.features.sms **/

import feature from 'mail.feature.define';

export default feature({
    name: 'sms',
    id: 'sms.features.sms',
    global: true,
    resources: [
        'sms.modelAddons.Message',
        'sms.modelAddons.NotificationGroup',
    ],
});
