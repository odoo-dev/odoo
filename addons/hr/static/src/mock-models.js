/** @odoo-module alias=hr.MockModels **/

import MockModels from 'mail.MockModels';

import { patch } from 'web.utils';

patch(MockModels, 'hr.MockModels', {

    //----------------------------------------------------------------------
    // Public
    //----------------------------------------------------------------------

    /**
     * @override
     */
    generateData() {
        const data = this._super(...arguments);
        Object.assign(data, {
            'hr.employee.public': {
                fields: {
                    display_name: {
                        string: "Name",
                        type: 'char',
                    },
                    user_id: {
                        relation: 'res.users',
                        string: "User",
                        type: 'many2one',
                    },
                    user_partner_id: {
                        relation: 'res.partner',
                        string: "Partner",
                        type: 'many2one',
                    },
                },
                records: [],
            },
        });
        return data;
    },

});
