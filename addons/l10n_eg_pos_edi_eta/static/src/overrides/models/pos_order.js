/** @odoo-module */

import { PosOrder } from "@point_of_sale/app/models/pos_order";
import { patch } from "@web/core/utils/patch";

patch(PosOrder.prototype, {
    //@override
    export_for_printing(baseUrl, headerData) {
        const result = super.export_for_printing(...arguments);
        result.l10n_eg_qr_code = this.l10n_eg_qr_code;
        return result;
    },
    wait_for_push_order() {
        return this.company.country_id?.code === "EG"
            ? true
            : super.wait_for_push_order(...arguments);
    },
});
