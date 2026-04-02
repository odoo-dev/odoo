import { PosOrder } from "@point_of_sale/app/models/pos_order";
import { patch } from "@web/core/utils/patch";

patch(PosOrder.prototype, {
    get isTakeaway() {
        return this.preset_id?.service_at !== "table" && this.config.use_presets;
    },
});
