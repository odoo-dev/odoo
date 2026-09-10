import { patch } from "@web/core/utils/patch";
import { PosOrderline } from "@point_of_sale/app/models/pos_order_line";

patch(PosOrderline.prototype, {
    setQuantity(quantity, keep_price) {
        const result = super.setQuantity(...arguments);
        const depositLine = this.deposit_parent_line_id || this.deposit_line_id;
        if (depositLine && !this.order_id.uiState._updatingDepositQuantity) {
            this.order_id.uiState._updatingDepositQuantity = true;
            depositLine.setQuantity(this.getQuantity(), true);
            this.order_id.uiState._updatingDepositQuantity = false;
        }
        return result;
    },

    get orderDisplayProductName() {
        const displayName = super.orderDisplayProductName;
        if (this.deposit_parent_line_id) {
            return {
                name: `${displayName.name} - ${this.deposit_parent_line_id.getFullProductName()}`,
                attributeString: displayName.attributeString,
            };
        }
        return displayName;
    },

    canBeMergedWith(orderline) {
        if (this.deposit_parent_line_id || orderline.deposit_parent_line_id) {
            return false;
        }
        return super.canBeMergedWith(orderline);
    },
});
