import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/store/pos_store";

patch(PosStore.prototype, {
    getReceiptHeaderData(order) {
        const result = super.getReceiptHeaderData(...arguments);
        const company = this.company;
        result.is_simplified = result.is_simplified || (company.country_id?.code === "OM" && order?.get_total_without_tax() < 500);
        return result;
    },
});
