/** @odoo-module */

import { PosOrder } from "@point_of_sale/app/models/pos_order";
import { patch } from "@web/core/utils/patch";

patch(PosOrder.prototype, {
    defaultTableNeeded(options) {
        return (
            super.defaultTableNeeded(...arguments) &&
            !this.name.includes("Kiosk") &&
            !this.name.includes("Self-Order")
        );
    },
});
