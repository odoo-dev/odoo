/** @odoo-module alias=website_livechat.MockModels **/

import MockModels from 'mail.MockModels';

import { patch } from 'web.utils';

patch(MockModels, 'website_livechat.MockModels', {

    //----------------------------------------------------------------------
    // Public
    //----------------------------------------------------------------------

    /**
     * @override
     */
    generateData() {
        const data = this._super(...arguments);
        Object.assign(data, {
            'website.visitor': {
                fields: {
                    country_id: {
                        relation: 'res.country',
                        string: "Country",
                        type: 'many2one',
                    },
                    display_name: {
                        string: "Display name",
                        type: 'string',
                    },
                    // Represent the browsing history of the visitor as a string.
                    // To ease testing this allows tests to set it directly instead
                    // of implementing the computation made on server.
                    // This should normally not be a field.
                    history: {
                        string: "History",
                        type: 'string',
                    },
                    is_connected: {
                        string: "Is connected",
                        type: 'boolean',
                    },
                    lang_name: {
                        string: "Language name",
                        type: 'string',
                    },
                    partner_id: {
                        relation: 'res.partner',
                        string: "partner",
                        type: 'many2one',
                    },
                    website_name: {
                        string: "Website name",
                        type: 'string',
                    },
                },
                records: [],
            },
        });
        Object.assign(data['mail.channel'].fields, {
            livechat_visitor_id: {
                relation: 'website.visitor',
                string: "Visitor",
                type: 'many2one',
            },
        });
        return data;
    },

});
