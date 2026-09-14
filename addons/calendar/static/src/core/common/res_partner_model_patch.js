import { ResPartner } from "@mail/core/common/res_partner_model";

import { patch } from "@web/core/utils/patch";

patch(ResPartner.prototype, {
    setup() {
        super.setup();
        /** @type {boolean|undefined} */
        this.is_in_calendar_meeting = undefined;
    },
});
