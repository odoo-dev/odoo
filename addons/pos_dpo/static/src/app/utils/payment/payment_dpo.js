import { _t } from "@web/core/l10n/translation";
import { PaymentInterface } from "@point_of_sale/app/utils/payment/payment_interface";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { serializeDateTime } from "@web/core/l10n/dates";
import { offlineErrorHandler, handleRPCError } from "@point_of_sale/app/utils/error_handlers";
import { register_payment_method } from "@point_of_sale/app/services/pos_store";
import { ConnectionLostError, RPCError } from "@web/core/network/rpc";

const REQUEST_TIMEOUT_MS = 5 * 1000; // 3 seconds
const CANCEL_REQUEST_TIME_LIMIT_MS = 10 * 60 * 1000; // 10 minutes
const { DateTime } = luxon;

export class PaymentDPO extends PaymentInterface {
    setup() {
        super.setup(...arguments);
        this.pollingTimeout = null;
        this.inactivityTimeout = null;
        this.payment_stopped = false;
    }

    sendPaymentRequest(cid) {
        super.sendPaymentRequest(cid);
        return this._processDPO();
    }

    pendingDPOPaymentLine() {
        return this.pos.getPendingPaymentLine("dpo");
    }

    sendPaymentCancel(order, cid) {
        super.sendPaymentCancel(order, cid);
        return this._dpoCancel({ source_id: order.getSelectedPaymentline().dpo_source_id });
    }

    _callDPO(data, action) {
        return this.pos.data
            .call("pos.payment.method", action, [[this.payment_method_id.id], data])
            .catch((error) => {
                const line = this.pendingDPOPaymentLine();
                this.pos.paymentTerminalInProgress = false;
                if (line) {
                    line.setPaymentStatus("force_done");
                }
                if (error instanceof ConnectionLostError) {
                    offlineErrorHandler(this.env, error, error);
                } else if (error instanceof RPCError) {
                    handleRPCError(error, this.env.services.dialog);
                } else {
                    throw error;
                }
            });
    }

    /**
     * Handles the response from DPO by network for a make payment request.
     * @param {Object} response - The response received from DPO by network.
     * @returns {Promise<Object|boolean>} - Resolves when the payment confirmation process completes.
     */
    async _makePaymentRequestHandler(response) {
        const line = this.pendingDPOPaymentLine();
        if (!response || response?.errorMessage) {
            line.setPaymentStatus("retry");
            this._showError(
                response?.errorMessage || _t("DPO by network make payment request failed")
            );
            return false;
        }

        line.setPaymentStatus("waitingCard");
        return await this._waitForPaymentToConfirm();
    }
    /**
     * Handles the response from DPO by network for a payment status request.
     * @param {Object} response - The response received from DPO by network.
     * @param {Function} callBack - The function to call for retrying the status request.
     * @param {Function} resolve - The function to resolve the promise.
     * @param {Function} reject - The function to reject the promise.
     * @returns {Promise<Object|boolean>} - Resolves with the response object on success, otherwise `false`.
     */
    async _paymentStatusRequestHandler(response, callBack, resolve, reject) {
        const line = this.pos.getOrder().getSelectedPaymentline();

        if (!response || response?.errorMessage) {
            const status = response ? "retry" : "force_done";
            line.setPaymentStatus(status);
            this._showError(
                response?.errorMessage || _t("DPO by network get payment status request failed")
            );
            if (response) {
                return resolve(false);
            }
        }
        const isTnxCompleted = response.complete;
        if (isTnxCompleted) {
            const data = await this._callDPO(
                { source_id: response["sourceId"] },
                "dpo_fetch_payment_result"
            );
            line.update({
                payment_method_issuer_bank: data["Acquirer Name"],
                payment_method_authcode: data["authCode"],
                cardholder_name: data["CardHolderName"],
                card_no: data["cardNumber"]?.slice(-4) || "",
                card_brand: data["cardType"],
                payment_method_payment_mode: data["PaymentMode"],
                transaction_id: data["rrn"],
                payment_date: this._getPaymentDate(
                    data["TransactionDate"],
                    data["TransactionTime"]
                ),
            });
            this._removePaymentHandler();
            return resolve(response);
        } else {
            const isOffline = response.offline;
            if (isOffline) {
                line.setPaymentStatus("retry");
                this._showError(_t("DPO by network payment is offline"));
                return resolve(false);
            }
            const isDeclined = response.declined;
            if (isDeclined) {
                line.setPaymentStatus("retry");
                this._showError(_t("DPO by network payment is declined"));
                return resolve(false);
            }
            this.pollingTimeout = setTimeout(callBack, REQUEST_TIMEOUT_MS, resolve, reject);
        }
    }
    /**
     * Handles the response from DPO by network for a payment cancellation request.
     * @param {Object} response - The response received from DPO by network.
     * @returns {boolean} - Returns `true` if a notification is processed, otherwise `false`.
     */
    _paymentCancelRequestHandler(response) {
        const line = this.pendingDPOPaymentLine();
        if (!response || response?.errorMessage) {
            this._showError(
                response?.errorMessage || _t("DPO by network payment cancellation request failed")
            );
            return false;
        } else if (response.responseCode) {
            line.setPaymentStatus("retry");
            if (this.payment_stopped) {
                this._showError(_t("Transaction failed due to inactivity"));
            } else {
                this.pos.notification.add(response.responseMessage, {
                    type: "warning",
                    sticky: false,
                });
            }
            this._removePaymentHandler();
            return true;
        } else {
            return false;
        }
    }

    /**
     * This method processes order data and sends payment requests from POS to DPO by network.
     */
    async _processDPO() {
        const order = this.pos.getOrder();
        const paymentLine = order.getSelectedPaymentline();
        if (paymentLine.amount < 0) {
            this._showError(_t("Cannot process transactions with negative amount."));
            return false;
        }

        const orderId = order?.pos_reference?.replace(" ", "").replaceAll("-", "").toUpperCase();
        const referencePrefix = this.pos.config.name.replace(/\s/g, "").slice(0, 4);
        paymentLine.update({
            dpo_source_id:
                referencePrefix + "/" + orderId + "/" + crypto.randomUUID().replaceAll("-", ""),
        });

        const data = {
            amount: paymentLine.amount,
            source_id: paymentLine.dpo_source_id,
        };
        const response = await this._callDPO(data, "dpo_make_payment_request");
        return await this._makePaymentRequestHandler(response);
    }

    async _dpoCancel(data) {
        const response = await this._callDPO(data, "dpo_cancel_payment_request");
        return this._paymentCancelRequestHandler(response);
    }

    /**
     * This method waits for the payment to be confirmed by DPO by Network payment Terminal.
     * Also, this method uses polling to check the payment status..
     */
    async _waitForPaymentToConfirm() {
        const paymentLine = this.pos.getOrder().getSelectedPaymentline();
        if (!paymentLine || paymentLine.payment_status == "retry") {
            return false;
        }
        const data = {
            source_id: paymentLine.dpo_source_id,
        };
        this._stopPendingPayment().then(() => (this.payment_stopped = true));
        const dpoFetchPaymentStatus = async (resolve, reject) => {
            //Clear the previous timeout before setting a new one
            clearTimeout(this.pollingTimeout);

            // If the user navigates to another screen, stop the polling
            if (this.pos.router.state.current !== "PaymentScreen") {
                this._removePaymentHandler();
                return;
            }

            if (this.payment_stopped) {
                this._dpoCancel(data).then(() => {
                    paymentLine.setPaymentStatus("retry");
                    this.payment_stopped = false;
                });
                return resolve(false);
            }

            if (paymentLine.payment_status == "retry") {
                return resolve(false);
            }
            const response = await this._callDPO(data, "dpo_fetch_payment_status");
            return this._paymentStatusRequestHandler(
                response,
                dpoFetchPaymentStatus,
                resolve,
                reject
            );
        };
        return new Promise(dpoFetchPaymentStatus);
    }

    _getPaymentDate(dateString, timeString) {
        // The dateString value appears as `03122024`, while the timeString value appears as `063515`.
        const localDate = DateTime.fromFormat(`${dateString} ${timeString}`, "dd/MM/yyyy HH:mm");
        return serializeDateTime(localDate);
    }

    _stopPendingPayment() {
        return new Promise(
            (resolve) =>
                (this.inactivityTimeout = setTimeout(resolve, CANCEL_REQUEST_TIME_LIMIT_MS))
        );
    }

    _removePaymentHandler() {
        clearTimeout(this.pollingTimeout);
        clearTimeout(this.inactivityTimeout);
        this.payment_stopped = false;
    }

    _showError(error_msg) {
        this.env.services.dialog.add(AlertDialog, {
            title: _t("DPO By Network Error"),
            body: error_msg,
        });
    }
}

register_payment_method("dpo", PaymentDPO);
