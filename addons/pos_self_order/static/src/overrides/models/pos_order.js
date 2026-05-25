import { PosOrder } from "@point_of_sale/app/models/pos_order";
import { patch } from "@web/core/utils/patch";

patch(PosOrder.prototype, {
    getName() {
        if (this.floating_order_name) {
            return this.floating_order_name;
        }
        return super.getName(...arguments);
    },
});
