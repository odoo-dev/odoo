/** @odoo-module alias=hr_holidays.MockModels **/

import MockModels from 'mail.MockModels';

import { patch } from 'web.utils';

patch(MockModels, 'hr_holidays.MockModels', {

    //----------------------------------------------------------------------
    // Public
    //----------------------------------------------------------------------

    /**
     * @override
     */
    generateData() {
        const data = this._super(...arguments);
        Object.assign(data['res.partner'].fields, {
            // Not a real field but ease the testing
            out_of_office_date_end: { type: 'datetime' },
        });
        return data;
    },

});
