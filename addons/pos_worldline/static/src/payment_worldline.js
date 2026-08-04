import { _t } from "@web/core/l10n/translation";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { PaymentInterface } from "@point_of_sale/app/utils/payment/payment_interface";
import { registry } from "@web/core/registry";

export class PaymentWorldline extends PaymentInterface {
    setup() {
        super.setup(...arguments);
        this.paymentLineResolvers = {};

        this.connectWebSocket("WORLDLINE_CLOUD_PAYMENT_STATUS", (payload) => {
            if (payload.pos_session_id !== this.pos.session.id) {
                return;
            }
            const paymentLine = this.pos.models["pos.payment"].find(
                (line) => line.uuid === payload.payment_uuid
            );
            if (paymentLine && !paymentLine.isDone()) {
                this.handleWorldlineStatusResponse(paymentLine, payload);
            }
        });
    }

    async sendPaymentRequest(line) {
        if (line.amount < 0) {
            const originalTransactionId = this._findOriginalTransactionId(line);
            if (!originalTransactionId) {
                this._showWorldlineError(
                    _t("You can only refund an order that was paid for with Worldline.")
                );
                return false;
            }
            return this._createWorldlineRefund(line, originalTransactionId);
        }

        return this._createWorldlinePayment(line);
    }

    async sendPaymentCancel() {
        // The Worldline Terminal API async payment endpoint doesn't expose a way to abort
        // an in-flight request from the ECR side; the terminal itself has to time out or
        // be cancelled on the device.
        return true;
    }

    async _createWorldlinePayment(paymentLine) {
        try {
            const data = await this.callPaymentMethod("worldline_create_payment", [
                this.payment_method_id.id,
                paymentLine.amount,
                paymentLine.uuid,
                this.pos.session.id,
            ]);
            if (data.error) {
                this._showWorldlineError(data.error);
                return false;
            }
            paymentLine.setPaymentStatus("waitingCard");
            return this._waitForPaymentConfirmation(paymentLine);
        } catch (error) {
            this._showWorldlineError(error);
            return false;
        }
    }

    async _createWorldlineRefund(refundPaymentLine, originalTransactionId) {
        try {
            const data = await this.callPaymentMethod("worldline_create_refund", [
                this.payment_method_id.id,
                originalTransactionId,
                Math.abs(refundPaymentLine.amount),
                refundPaymentLine.uuid,
                this.pos.session.id,
            ]);
            if (data.error) {
                this._showWorldlineError(data.error);
                return false;
            }
            refundPaymentLine.setPaymentStatus("waitingCard");
            return this._waitForPaymentConfirmation(refundPaymentLine);
        } catch (error) {
            this._showWorldlineError(error);
            return false;
        }
    }

    _findOriginalTransactionId(refundPaymentLine) {
        const currentOrder = refundPaymentLine.pos_order_id;
        const orderToRefund = currentOrder.lines[0]?.refunded_orderline_id?.order_id;
        if (!orderToRefund) {
            return null;
        }

        const matchedPaymentLine = orderToRefund.payment_ids.find(
            (line) => line.payment_provider === "worldline_cloud" && line.transaction_id
        );
        return matchedPaymentLine?.transaction_id ?? null;
    }

    _waitForPaymentConfirmation(paymentLine) {
        const { promise, resolve } = Promise.withResolvers();
        this.paymentLineResolvers[paymentLine.uuid] = resolve;
        return promise;
    }

    handleWorldlineStatusResponse(paymentLine, payload) {
        paymentLine.transaction_id = payload.transaction_id;

        if (!payload.success) {
            this._showWorldlineError(
                _t("The transaction was declined or failed. Please try again.")
            );
        }

        const resolver = this.paymentLineResolvers?.[paymentLine.uuid];
        if (resolver) {
            this.paymentLineResolvers[paymentLine.uuid] = null;
            resolver(payload.success);
        } else {
            paymentLine.handlePaymentResponse(payload.success);
        }
    }

    _extractErrorMessage(error) {
        if (typeof error === "string") {
            return error;
        }
        if (error.name === "RPC_ERROR") {
            return error.data.message;
        }
        return error.message;
    }

    _showWorldlineError(error) {
        this.env.services.dialog.add(AlertDialog, {
            title: _t("Worldline Error"),
            body: this._extractErrorMessage(error),
        });
    }
}

registry.category("pos_payment_providers").add("worldline_cloud", PaymentWorldline);
