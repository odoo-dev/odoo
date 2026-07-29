import { patch } from "@web/core/utils/patch";
import { PosOrderlineAccounting } from "@point_of_sale/app/models/accounting/pos_order_line_accounting";

patch(PosOrderlineAccounting.prototype, {
    prepareBaseLineForTaxesComputationExtraValues(customValues = {}) {
        const values = super.prepareBaseLineForTaxesComputationExtraValues(customValues);
        if (this.isRebuLine()) {
            values.purchase_price = this.purchase_price || 0;
        }
        return values;
    },
});