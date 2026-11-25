import { patch } from "@web/core/utils/patch";
import { PaymentDPOPay } from "@pos_dpopay/app/utils/payment/payment_dpopay";

patch(PaymentDPOPay.prototype, {
    async _callDpoPayMakeRequest(data, action) {
        if (action === "start-transaction") {
            data = { ...data, orderUuid: this.pos.getOrder()?.uuid };
        } else if (action === "cancel-transaction" && this.paymentStopped) {
            // `paymentStopped` is only set by the 3-minute inactivity timer.
            data = { ...data, cancelReason: "timeout" };
        }
        return await super._callDpoPayMakeRequest(data, action);
    },
});
