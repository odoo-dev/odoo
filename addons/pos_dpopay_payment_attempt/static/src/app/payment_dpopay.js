import { patch } from "@web/core/utils/patch";
import { PaymentDPOPay } from "@pos_dpopay/app/utils/payment/payment_dpopay";

patch(PaymentDPOPay.prototype, {
    _attemptLine() {
        return this._pendingDPOPaymentLine() || this.pos.getOrder()?.getSelectedPaymentline();
    },

    async _callDpoPayMakeRequest(data, action) {
        const attempt = this._attemptLine()?.paymentAttempt;
        if (attempt && !attempt.closed && data?.sourceId) {
            data = { ...data, attemptUuid: attempt.uuid };
            // `paymentStopped` is only set by the inactivity timer.
            if (action === "cancel-transaction" && this.paymentStopped) {
                attempt.timedOut = true;
                data.cancelReason = "timeout";
            }
        }
        return await super._callDpoPayMakeRequest(data, action);
    },

    _handleError(response, fallbackMessage) {
        this._pendingDPOPaymentLine()?.setPaymentAttemptError(
            response?.errorMessage ?? fallbackMessage
        );
        return super._handleError(...arguments);
    },
});
