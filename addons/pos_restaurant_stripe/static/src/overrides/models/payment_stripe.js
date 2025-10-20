import { PaymentStripe } from "@pos_stripe/app/payment_stripe";
import { patch } from "@web/core/utils/patch";

patch(PaymentStripe.prototype, {
    async captureAfterPayment(processPayment, line) {
        // Don't capture if the customer can tip, in that case we
        // will capture later.
        if (!this.canBeAdjusted(line.uuid)) {
            return super.captureAfterPayment(...arguments);
        }
    },

    canBeAdjusted(uuid) {
        var order = this.pos.getOrder();
        var line = order.getPaymentlineByUuid(uuid);
        return (
            this.pos.config.set_tip_after_payment &&
            line.payment_method_id.use_payment_terminal === "stripe" &&
            line.card_type !== "interac" &&
            (!line.card_type || !line.card_type.includes("eftpos"))
        );
    },

    async sendPaymentAdjust(uuid) {
        var order = this.pos.getOrder();
        var line = order.getPaymentlineByUuid(uuid);

        // Copy-paste of capturePayment to pass in a custom amount and context
        try {
            const data = await this.pos.data.silentCall(
                "pos.payment.method",
                "stripe_capture_payment",
                [line.transaction_id],
                {
                    amount: line.amount,
                    context: {
                        stripe_currency_rounding: line.currency_id.rounding,
                    },
                },
            );
            if (data.error) {
                throw data.error;
            }
            return data;
        } catch (error) {
            const { message } = error.data || error;
            this._showError(message, "Capture Payment");
            return false;
        }
    }
});
