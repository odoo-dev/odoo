/** @odoo-module alias=hr.features.hr **/

import feature from 'mail.feature.define';

export default feature({
    name: 'hr',
    id: 'hr.features.hr',
    global: true,
    resources: [
        'hr.modelAddons.Messaging',
        'hr.modelAddons.Partner',
        'hr.modelAddons.User',
        'hr.models.Employee',
    ],
});
