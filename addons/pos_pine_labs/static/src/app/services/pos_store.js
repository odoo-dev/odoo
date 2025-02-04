import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/store/pos_store";

patch(PosStore.prototype, {
    async closeSession() {
        const unrecordedPinelabsPayments = this.models["pos.payment"].filter(
            (payment) =>
                !payment.is_payment_recorded &&
                payment.payment_method_id.use_payment_terminal === "pine_labs"
        );
        if (unrecordedPinelabsPayments.length) {
            for (const payment of unrecordedPinelabsPayments) {
                const payment_status =
                    await payment.payment_method_id.payment_terminal._waitForPaymentToConfirm(
                        payment
                    );
                if (payment_status?.status === "TXN APPROVED") {
                    payment.update({ payment_status: "done" });
                } else {
                    payment.pos_order_id.update({ state: "cancel" });
                }
            }
        }
        super.closeSession(...arguments);
    },
});
