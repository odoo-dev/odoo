/** @odoo-module alias=snailmail.MockModels **/

import MockModels from 'mail.MockModels';

import { patch } from 'web.utils';

patch(MockModels, 'snailmail.MockModels', {

    //----------------------------------------------------------------------
    // Public
    //----------------------------------------------------------------------

    /**
     * @override
     */
    generateData() {
        const data = this._super(...arguments);
        Object.assign(data, {
            'snailmail.letter': {
                fields: {
                    message_id: {
                        relation: 'mail.message',
                        string: "Snailmail Status Message",
                        type: 'many2one',
                    },
                },
                records: [],
            },
        });
        return data;
    },

});
