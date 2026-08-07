import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/services/pos_store";

patch(PosStore.prototype, {
    _getSOPaymentVals(transaction) {
        return {
            ...super._getSOPaymentVals(...arguments),
            online_account_payment_id: transaction.payment_id,
        };
    },
    _getSettledAccountPaymentIds(posOrder) {
        const settled = super._getSettledAccountPaymentIds(...arguments);
        for (const payment of posOrder.payment_ids) {
            if (payment.online_account_payment_id) {
                settled.add(payment.online_account_payment_id.id);
            }
        }
        return settled;
    },
});
