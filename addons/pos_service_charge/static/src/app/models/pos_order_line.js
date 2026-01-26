import { PosOrderline } from "@point_of_sale/app/models/pos_order_line";
import { patch } from "@web/core/utils/patch";

patch(PosOrderline.prototype, {
    get isServiceChargeLine() {
        return this.product_id.id === this.config.service_charge_product_id?.id;
    }
});
