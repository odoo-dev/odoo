/** @odoo-module alias=hr_holidays.modelAddons.Partner.actionAddons.convertData **/

import actionAddon from 'mail.action.addon.define';

import { str_to_datetime } from 'web.time';

export default actionAddon({
    actionName: 'Partner/convertData',
    id: 'hr_holidays.modelAddons.Partner.actionAddons.convertData',
    global: true,
    /**
     * @param {Object} param0
     * @param {function} param0.original
     * @param {Object} data
     */
    func(
        { original },
        data,
    ) {
        const data2 = original(data);
        if ('out_of_office_date_end' in data && data.date) {
            data2.outOfOfficeDateEnd = new Date(
                str_to_datetime(data.out_of_office_date_end),
            );
        }
        return data2;
    },
});
