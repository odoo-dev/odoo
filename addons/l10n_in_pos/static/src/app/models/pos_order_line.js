import { PosOrderline } from "@point_of_sale/app/models/pos_order_line";
import { patch } from "@web/core/utils/patch";
import { getTaxesAfterFiscalPosition } from "@point_of_sale/app/models/utils/tax_utils";

patch(PosOrderline.prototype, {
    setup(vals) {
        return super.setup(...arguments);
    },

    // EXTENDS 'point_of_sale'
    prepareBaseLineForTaxesComputationExtraValues(customValues = {}) {
        const extraValues = super.prepareBaseLineForTaxesComputationExtraValues(customValues);
        extraValues.l10n_in_hsn_code = this.product_id?.l10n_in_hsn_code;
        const unit_price_after_discount = this.get_unit_price_after_discount();
        const threshold = this.product_id?.l10n_in_threshold_limit || 0;
        const taxRateIds = this.product_id?.l10n_in_hsn_based_tax_id;
        if (unit_price_after_discount > threshold && taxRateIds) {
            let taxIds = Array.isArray(taxRateIds) ? taxRateIds : [taxRateIds];
            if (this.order_id?.fiscal_position_id) {
                taxIds = getTaxesAfterFiscalPosition(
                    taxIds,
                    this.order_id.fiscal_position_id,
                    this.order_id.models
                );
            }
            extraValues.tax_ids = taxIds;
        }
        return extraValues;
    },

    get_unit_price_after_discount() {
        const priceUnit = this.getUnitPrice();
        const discount = this.getDiscount();
        return priceUnit - (priceUnit * discount) / 100;
    },
});
