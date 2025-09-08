import { patch } from "@web/core/utils/patch";
import { SelfOrder } from "@pos_self_order/app/services/self_order_service";

patch(SelfOrder.prototype, {
    filterPaymentMethods(pms) {
        const pm = super.filterPaymentMethods(...arguments);
        const qfpay_pm = pms.filter((rec) => rec.use_payment_terminal === "adyen");
        return [...new Set([...pm, ...qfpay_pm])];
    },
});
