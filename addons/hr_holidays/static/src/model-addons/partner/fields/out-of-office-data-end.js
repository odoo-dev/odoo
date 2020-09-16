/** @odoo-module alias=hr_holidays.modelAddons.Partner.fields.outOfOfficeDateEnd **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'outOfOfficeDateEnd',
    id: 'hr_holidays.modelAddons.Partner.fields.outOfOfficeDateEnd',
    global: true,
    default() {
        return new Date();
    },
});
