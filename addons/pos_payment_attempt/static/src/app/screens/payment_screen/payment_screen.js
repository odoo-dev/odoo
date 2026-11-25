import { patch } from "@web/core/utils/patch";
import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
import { PaymentAttemptRecoveryDialog } from "@pos_payment_attempt/app/components/payment_attempt_recovery_dialog/payment_attempt_recovery_dialog";

patch(PaymentScreen.prototype, {
    onMounted() {
        super.onMounted(...arguments);
        this.checkPaymentAttemptsToRecover();
    },

    async checkPaymentAttemptsToRecover() {
        const order = this.currentOrder;
        if (!order || order.finalized || this.pos.data.network.offline) {
            return;
        }
        let attempts;
        try {
            attempts = await this.pos.data.call("pos.payment.attempt", "get_attempts_to_recover", [
                order.uuid,
            ]);
        } catch {
            return;
        }
        attempts = (attempts || []).filter(
            (attempt) => !this.isPaymentAttemptHandledLocally(order, attempt)
        );
        if (attempts.length && this.currentOrder === order) {
            this.dialog.add(PaymentAttemptRecoveryDialog, { order, attempts });
        }
    },

    /**
     * An attempt needs no recovery when its payment line is still here and either paid or
     * still being processed (e.g. a provider resuming its polling after a reload).
     */
    isPaymentAttemptHandledLocally(order, attempt) {
        const line = order.payment_ids.find((payment) => payment.uuid === attempt.payment_uuid);
        if (!line) {
            return false;
        }
        if (line.paymentAttempt?.uuid === attempt.uuid && !line.paymentAttempt.closed) {
            return true;
        }
        return line.isDone() || line.isProcessing() || line.payment_status === "force_done";
    },
});
