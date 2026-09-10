import { patch } from "@web/core/utils/patch";
import { PosOrderline } from "@point_of_sale/app/models/pos_order_line";

patch(PosOrderline.prototype, {
    initState() {
        super.initState();
        if (this.deposit_parent_line_id) {
            this.uiState.isDepositLine = true;
        }
    },
    setQuantity(quantity, keep_price) {
        const result = super.setQuantity(...arguments);
        const order = this.order_id;
        if (!order?.uiState || order.uiState._syncingDepositQty) {
            return result;
        }

        if (this.deposit_parent_line_id) {
            order.uiState._syncingDepositQty = true;
            try {
                this.deposit_parent_line_id.setQuantity(this.getQuantity(), true);
            } finally {
                order.uiState._syncingDepositQty = false;
            }
        } else if (this.deposit_line_id) {
            const newQty = this.getQuantity();
            order.uiState._syncingDepositQty = true;
            try {
                this.deposit_line_id.setQuantity(newQty, true);
            } finally {
                order.uiState._syncingDepositQty = false;
            }
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
