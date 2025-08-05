import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/services/pos_store";

patch(PosStore.prototype, {
    async pay() {
        const currentOrder = this.getOrder();
        const remainingAmount = currentOrder.taxTotals.order_sign * currentOrder.taxTotals.order_remaining;
        if (currentOrder.company_id.country_id.code == 'IN' && currentOrder.company_id.l10n_in_upi_id && remainingAmount > 0) {
            currentOrder.uiState.upiQrCode = await this.data.call(
                "res.company", "generate_upi_base64_code", [
                currentOrder.company_id.id,
                remainingAmount,
                currentOrder.pos_reference,
                currentOrder.name,
            ]);
        }
        return super.pay(...arguments);
    },
});
