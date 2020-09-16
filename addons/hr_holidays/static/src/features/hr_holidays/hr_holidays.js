/** @odoo-module alias=hr_holidays.features.hr_holidays **/

import feature from 'mail.feature.define';

export default feature({
    name: 'hr_holidays',
    id: 'hr_holidays.features.hr_holidays',
    global: true,
    resources: ['hr_holidays.modelAddons.Partner'],
});
