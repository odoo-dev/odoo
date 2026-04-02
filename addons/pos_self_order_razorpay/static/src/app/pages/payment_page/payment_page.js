import { patch } from "@web/core/utils/patch";
import { PaymentInterface } from "@pos_self/app/components/payment_interface/payment_interface";

patch(PaymentInterface.prototype, {
    async startPayment() {
        this.selfOrder.paymentError = false;
        const paymentMethod = this.selfOrder.models["pos.payment.method"].find(
            (p) => p.id === this.state.paymentMethodId
        );

        if (paymentMethod.payment_provider === "razorpay") {
            await this.selfOrder.razorpay.startPayment(this.selfOrder.currentOrder);
        } else {
            await super.startPayment(...arguments);
        }
    },
});
