import { patch } from "@web/core/utils/patch";
import { _t } from "@web/core/l10n/translation";
import { PosPayment } from "@point_of_sale/app/models/pos_payment";
import { uuidv4 } from "@point_of_sale/utils";

const PROCESSING_STATUSES = ["waitingCard", "waitingScan", "waitingCapture", "waitingCancel"];
const FINAL_ATTEMPT_STATES = [
    "success",
    "failed",
    "cancelled",
    "timeout",
    "force_done",
    "force_cancelled",
];

patch(PosPayment.prototype, {
    /**
     * The attempt currently running on this line, if any. A new one starts on every `pay()`,
     * so retrying a failed payment creates a new attempt.
     */
    get paymentAttempt() {
        return this.uiState?.paymentAttempt;
    },

    async pay() {
        if (this.payment_interface) {
            this.startPaymentAttempt();
        }
        return await super.pay(...arguments);
    },

    startPaymentAttempt() {
        this.uiState.paymentAttempt = {
            uuid: uuidv4(),
            cancelRequested: false,
            timedOut: false,
            forcedState: null,
            errorMessage: "",
            closed: false,
        };
        return this.uiState.paymentAttempt;
    },

    setPaymentStatus(value) {
        const previous = this.payment_status;
        super.setPaymentStatus(value);
        if (previous !== value) {
            this.onPaymentAttemptStatusChange(value, previous);
        }
    },

    async cancelPayment() {
        if (this.paymentAttempt) {
            this.paymentAttempt.cancelRequested = true;
        }
        return await super.cancelPayment(...arguments);
    },

    forceDone() {
        if (this.paymentAttempt && !this.isDone()) {
            this.paymentAttempt.forcedState = "force_done";
        }
        return super.forceDone(...arguments);
    },

    forceCancel() {
        if (this.paymentAttempt && !this.isDone()) {
            this.paymentAttempt.forcedState = "force_cancelled";
        }
        return super.forceCancel(...arguments);
    },

    /**
     * Record why the current attempt failed; sent with the next status update.
     */
    setPaymentAttemptError(message) {
        if (this.paymentAttempt && message) {
            this.paymentAttempt.errorMessage = String(message);
        }
    },

    getPaymentAttemptState(status, attempt) {
        if (status === "waiting") {
            return { state: "initiated" };
        }
        if (status === "waitingCancel") {
            return { state: "processing", message: _t("Cancellation requested by the cashier") };
        }
        if (PROCESSING_STATUSES.includes(status)) {
            return { state: "processing" };
        }
        if (status === "done") {
            return { state: attempt.forcedState === "force_done" ? "force_done" : "success" };
        }
        if (status === "retry") {
            if (attempt.forcedState === "force_cancelled") {
                return { state: "force_cancelled" };
            }
            if (attempt.timedOut) {
                return { state: "timeout" };
            }
            return { state: attempt.cancelRequested ? "cancelled" : "failed" };
        }
        if (status === "force_done") {
            // The POS lost track of the terminal; only the cashier or the provider can tell.
            return {
                state: "unknown",
                message: _t("Connection with the payment provider lost"),
            };
        }
        return null;
    },

    onPaymentAttemptStatusChange(status, previous) {
        const attempt = this.paymentAttempt;
        if (!attempt || attempt.closed) {
            return;
        }
        if (previous === "waitingCancel" && PROCESSING_STATUSES.includes(status)) {
            attempt.cancelRequested = false;
        }
        const result = this.getPaymentAttemptState(status, attempt);
        if (!result) {
            return;
        }
        if (FINAL_ATTEMPT_STATES.includes(result.state)) {
            attempt.closed = true;
        }
        this.logPaymentAttempt(result.state, result.message);
    },

    getPaymentAttemptLogValues() {
        const order = this.pos_order_id;
        return {
            payment_method_id: this.payment_method_id.id,
            payment_uuid: this.uuid,
            order_uuid: order?.uuid,
            session_id: order?.session_id?.id,
            amount: this.amount,
            transaction_id: this.transaction_id || "",
            card_no: this.card_no || "",
            card_brand: this.card_brand || "",
            authcode: this.payment_method_authcode || "",
        };
    },

    logPaymentAttempt(state, message) {
        const logger = this.payment_interface?.pos?.paymentAttemptLogger;
        const attempt = this.paymentAttempt;
        if (!logger || !attempt) {
            return;
        }
        return logger.log({
            ...this.getPaymentAttemptLogValues(),
            uuid: attempt.uuid,
            state,
            message: message || "",
            error_message: attempt.errorMessage,
        });
    },
});
