/** @odoo-module */

import { PosOrder } from "@point_of_sale/app/models/pos_order";
import { patch } from "@web/core/utils/patch";

patch(PosOrder.prototype, {
    // FIXME use of pos
    setup() {
        super.setup(...arguments);
        if (this.isPeruvianCompany() && !this.partner_id) {
            this.update({ partner_id: this.pos.consumidorFinalAnonimoId });
        }
    },
    isPeruvianCompany() {
        return this.company.country_id?.code == "PE";
    },
});
