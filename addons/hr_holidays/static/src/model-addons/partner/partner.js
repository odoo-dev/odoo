/** @odoo-module alias=hr_holidays.modelAddons.Partner **/

import modelAddon from 'mail.model.addon.define';

export default modelAddon({
    modelName: 'Partner',
    id: 'hr_holidays.modelAddons.Partner',
    global: true,
    actionAddons: [
        'hr_holidays.modelAddons.Partner.actionAddons.convertData',
    ],
    fields: [
        'hr_holidays.modelAddons.Partner.fields.outOfOfficeDateEnd',
        'hr_holidays.modelAddons.Partner.fields.outOfOfficeText',
    ],
});
