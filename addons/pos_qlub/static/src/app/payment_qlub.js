import { _t } from "@web/core/l10n/translation";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { PaymentInterface } from "@point_of_sale/app/utils/payment/payment_interface";
import { registry } from "@web/core/registry";

const { DateTime } = luxon;

export class PaymentQlub extends PaymentInterface {
    setup() {
        super.setup(...arguments);
        this.orm = this.env.services.orm;
        this.dialog = this.env.services.dialog;
        this.paymentLineResolvers = {};
    }

    _getQlubPaymentPayload(uuid, order, amount) {
        // This payload will be further processed in the backend
        // to include location_id and pos_terminal_id
        return {
            timestamp: DateTime.now().toUnixInteger(),
            event: "transaction_created",
            payload: {
                id: `${uuid}--${order.config_id.id}`,
                order_id: order.id,
                amount: amount,
                // By specifying total_amount, Qlub's server does not need to fetch again for the order details
                total_amount: amount,
                partner_initiated: false,
                status: "pending",
            },
        };
    }

    _getQlubCancelPayload(uuid, order, amount) {
        const payload = this._getQlubPaymentPayload(uuid, order, amount);
        payload.event = "transaction_updated";
        payload.payload.status = "cancelled";
        return payload;
    }

    _resolvePaymentLine(pendingLine, isSuccessful) {
        // Here we resolve the Promise created in _waitForPaymentConfirmation()
        // If the resolver is missing (e.g., because of a reload), we call line.handlePaymentResponse() directly
        const resolver = this.paymentLineResolvers?.[pendingLine.uuid];
        if (resolver) {
            resolver(isSuccessful);
        } else {
            pendingLine.handlePaymentResponse(isSuccessful);
        }
    }

    async _callQlub(payload, pendingLine) {
        let result;
        try {
            result = await this.callPaymentMethod("qlub_send_payment_request", [
                [pendingLine.payment_method_id.id],
                payload,
            ]);
            if (!result.success) {
                this._showError(result.error);
                this._resolvePaymentLine(pendingLine, false);
            }
        } catch (error) {
            this._showError(
                _t(
                    "Qlub transaction failed. Please try again or use another payment method.\n%s",
                    error
                )
            );
            this._resolvePaymentLine(pendingLine, false);
        }
        return result;
    }

    _waitForPaymentConfirmation(uuid) {
        /*
            Once the payment response from the terminal is received in the backend,
            the backend will notify the frontend. This is handled by handleQlubResponse().

            handleQlubResponse() gets the resolver from paymentLineResolvers (which we are setting up here)
            Once resolve() is called, sendPaymentRequest() gets resolved
            and PoSPayment.handlePaymentResponse() gets called to finalize the payment
        */
        return new Promise((resolve) => {
            this.paymentLineResolvers[uuid] = resolve;
        });
    }

    _showError(error_msg) {
        this.dialog.add(AlertDialog, {
            title: _t("Qlub Error"),
            body: error_msg,
        });
    }

    async sendPaymentRequest(uuid) {
        await super.sendPaymentRequest(...arguments);
        const order = this.pos.getOrder();
        const line = order.getSelectedPaymentline();
        line.setPaymentStatus("waitingCard");

        if (line.amount < 0) {
            this._showError(_t("Refunds are not supported for the Qlub payment method."));
            return false;
        }
        const payload = this._getQlubPaymentPayload(uuid, order, line.amount);
        this._callQlub(payload, line);

        return this._waitForPaymentConfirmation(uuid);
    }

    async sendPaymentCancel(order, uuid) {
        super.sendPaymentCancel(order, uuid);
        const line = this.pos.getPendingPaymentLine("qlub");
        const payload = this._getQlubCancelPayload(uuid, order, line.amount);
        this._callQlub(payload, line);
        return true;
    }

    handleQlubResponse(data, pendingLine) {
        const { action, response, line_uuid } = data;

        if (!pendingLine || pendingLine.uuid !== line_uuid) {
            console.warn("Qlub: Received a response that does not match the current pending line.");
            return;
        }

        const isSuccessful = action === "result" && response.status === "completed";
        if (isSuccessful) {
            // TODO: is this even correct?
            pendingLine.payment_ref_no = response.authorization_code;
            pendingLine.transaction_id = response.transaction_id;
        } else if (action === "cancel" && response.status === "cancelled") {
            this._showError(_t("Qlub transaction has been cancelled from the terminal."));
        } else {
            this._showError(
                _t("Qlub transaction failed. Please try again or use another payment method.")
            );
        }

        this._resolvePaymentLine(pendingLine, isSuccessful);
    }
}

registry.category("electronic_payment_interfaces").add("qlub", PaymentQlub);
