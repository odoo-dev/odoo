import { PosOrder } from "@point_of_sale/app/models/pos_order";
import { patch } from "@web/core/utils/patch";

patch(PosOrder.prototype, {
    //@override
    _getIgnoredProductIdsTotalDiscount() {
        const productIds = super._getIgnoredProductIdsTotalDiscount(...arguments);
        if (this.config.down_payment_product_id) {
            productIds.push(this.config.down_payment_product_id.id);
        }
        return productIds;
    },
    get hasPrePaidSOPayment() {
        return this.payment_ids.some((payment) => payment.payment_method_id.use_sale_order_payment);
    },
    selectOrderline(line) {
        // Lines settled from a sale order paid online cannot be edited: the amount is
        // already fixed by the payment the customer made on the sale order.
        if (line?.sale_order_origin_id && this.hasPrePaidSOPayment) {
            return super.selectOrderline();
        }
        return super.selectOrderline(line);
    },
});
