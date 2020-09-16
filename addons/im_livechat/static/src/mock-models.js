/** @odoo-module alias=im_livechat.MockModels **/

import MockModels from 'mail.MockModels';

import { patch } from 'web.utils';

patch(MockModels, 'im_livechat.MockModels', {

    //----------------------------------------------------------------------
    // Public
    //----------------------------------------------------------------------

    /**
     * @override
     */
    generateData() {
        const data = this._super(...arguments);
        Object.assign(data, {
            'im_livechat.channel': {
                fields: {
                    user_ids: {
                        string: "Operators",
                        type: 'many2many',
                        relation: 'res.users',
                    }
                },
                records: [],
            }
        });
        Object.assign(data['mail.channel'].fields, {
            anonymous_name: {
                string: "Anonymous Name",
                type: 'char',
            },
            country_id: {
                relation: 'res.country',
                string: "Country",
                type: 'many2one',
            },
            livechat_active: {
                default: false,
                string: "Is livechat ongoing?",
                type: 'boolean',
            },
            livechat_channel_id: {
                relation: 'im_livechat.channel',
                string: "Channel",
                type: 'many2one',
            },
            livechat_operator_id: {
                relation: 'res.partner',
                string: "Operator",
                type: 'many2one',
            },
        });
        Object.assign(data['res.users'].fields, {
            livechat_username: {
                string: "Livechat Username",
                type: 'string',
            },
        });
        return data;
    },

});
