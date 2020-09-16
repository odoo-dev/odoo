/** @odoo-module alias=im_livechat.components.Discuss **/

import Discuss from 'mail.components.Discuss';

import { patch } from 'web.utils';

patch(
    Discuss.prototype,
    'im_livechat.components.Discuss',
    {
        //--------------------------------------------------------------------------
        // Public
        //--------------------------------------------------------------------------

        /**
         * @override
         */
        mobileNavbarTabs(...args) {
            return [
                ...this._super(...args),
                {
                    icon: 'fa fa-comments',
                    id: 'livechat',
                    label: this.env._t("Livechat"),
                },
            ];
        },
    },
);
