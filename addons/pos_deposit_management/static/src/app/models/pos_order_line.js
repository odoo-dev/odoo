/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { PosOrderline } from "@point_of_sale/app/models/pos_order_line";

patch(PosOrderline.prototype, {
    setQuantity(quantity, keep_price) {
        const result = super.setQuantity(quantity, keep_price);
        if (result === true) {
            this._syncDepositQuantity();
        }
        return result;
    },

    /**
     * Synchronize the quantity of the linked deposit line with this line's quantity.
     * When the main product line's quantity changes, the deposit line's quantity
     * is updated to match, and vice-versa.
     */
    _syncDepositQuantity() {
        if (this._isSyncingDeposit) {
            return;
        }
        this._isSyncingDeposit = true;
        try {
            // Determine the linked line: either the deposit line or the main line
            const linkedLine = this._depositLine || this._mainLine;
            if (linkedLine && this.order_id.lines.includes(linkedLine)) {
                const rounder = this.models["decimal.precision"].find(
                    (dp) => dp.name === "Product Unit"
                );
                linkedLine.qty = rounder.round(this.qty);
                if (linkedLine.price_type === "original") {
                    linkedLine.recomputeUnitPrice();
                }
            }
        } finally {
            this._isSyncingDeposit = false;
        }
    },
});
