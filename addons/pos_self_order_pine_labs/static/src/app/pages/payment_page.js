import { patch } from "@web/core/utils/patch";
import { PaymentInterface } from "@pos_self/app/components/payment_interface/payment_interface";

patch(PaymentInterface.prototype, {
    async startPayment() {
        const paymentMethod = this.selfOrder.models["pos.payment.method"].find(
            (p) => p.id === this.state.paymentMethodId
        );
        if (paymentMethod.payment_provider === "pine_labs") {
            this.selfOrder.paymentError = false;
            await this.selfOrder.pineLabs.startPayment(this.selfOrder.currentOrder);
        } else {
            await super.startPayment(...arguments);
        }
    },
});
