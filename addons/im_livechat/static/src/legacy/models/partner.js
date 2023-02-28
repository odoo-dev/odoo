/** @odoo-module **/

import { attr, Patch } from "@mail/legacy/model";

Patch({
    name: "Partner",
    fields: {
        /**
         * States the specific name of this partner in the context of livechat.
         * Either a string or undefined.
         */
        user_livechat_username: attr(),
    },
});
