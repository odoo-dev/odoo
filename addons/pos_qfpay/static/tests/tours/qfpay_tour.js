/* global posmodel */
import * as Chrome from "@point_of_sale/../tests/pos/tours/utils/chrome_util";
import * as FeedbackScreen from "@point_of_sale/../tests/pos/tours/utils/feedback_screen_util";
import * as PaymentScreen from "@point_of_sale/../tests/pos/tours/utils/payment_screen_util";
import * as ProductScreen from "@point_of_sale/../tests/pos/tours/utils/product_screen_util";
import * as TicketScreen from "@point_of_sale/../tests/pos/tours/utils/ticket_screen_util";
import * as Dialog from "@point_of_sale/../tests/generic_helpers/dialog_util";
import { patch } from "@web/core/utils/patch";
import { registry } from "@web/core/registry";
import { QFPay } from "@pos_qfpay/app/qfpay";
import { mockQFPayWebhook } from "@pos_qfpay/../tests/tours/utils/common";

const { DateTime } = luxon;

// Patch QFPay to validate the request that would be sent to the terminal
patch(QFPay.prototype, {
    makeQFPayRequest: async function (endpoint, payload, terminal) {
        const paymentLine = posmodel.getPendingPaymentLine("qfpay");
        const paymentMethod = paymentLine.payment_method_id;
        // The device selected the second terminal of the payment method
        if (terminal !== paymentLine.terminal_id || terminal !== paymentMethod.terminal_ids[1]) {
            throw new Error("The request is not sent to the terminal selected by the device");
        }
        let expectedPayload;
        if (endpoint === "trade") {
            const uuid = paymentLine.uuid;
            const sessionId = posmodel.config.current_session_id.id;
            expectedPayload = {
                func_type: 1001,
                amt: paymentLine.amount,
                channel: paymentMethod.qfpay_payment_type,
                out_trade_no: `${uuid}--${sessionId}--${paymentMethod.id}`,
            };
        } else if (endpoint === "cancel") {
            const originalPayment = paymentLine.pos_order_id.refunded_order_id.payment_ids.find(
                (l) => l.payment_method_id.id === paymentMethod.id
            );
            expectedPayload = {
                func_type: 1002,
                orderId: originalPayment.transaction_id,
                refund_amount: (-paymentLine.amount).toFixed(2),
            };
        }
        if (!payload || JSON.stringify(payload) !== JSON.stringify(expectedPayload)) {
            throw new Error("Payload does not match expected payload");
        }
        return true;
    },
});

// Store uuid of payment between order and refund
let paymentUuid = "";

registry.category("web_tour.tours").add("qfpay_order_and_refund", {
    steps: () =>
        [
            // Refund have to be made on the same day before 23:00 HKT.
            Chrome.freezeDateTime(
                DateTime.now().setZone("Asia/Hong_Kong").set({ hour: 12 }).toMillis()
            ),
            Chrome.startPoS(),
            Dialog.confirm("Open Register"),

            // ORDER
            ProductScreen.addOrderline("Desk Pad"),
            ProductScreen.clickPayButton(),
            // The payment method has 2 terminals, the device selects the one it uses
            PaymentScreen.clickPaymentMethod("Qfpay"),
            {
                content: "Select the second terminal as default",
                trigger: ".modal button:contains('Terminal 2')",
                run: "click",
            },
            Dialog.confirm("Confirm"),
            PaymentScreen.clickSendButton(),
            {
                content: "Waiting for Qfpay payment to be processed",
                trigger: ".paymentline_status_title:contains('Waiting for card')",
                run: async function () {
                    const paymentLine = posmodel.getPendingPaymentLine("qfpay");
                    paymentUuid = paymentLine.uuid;
                    const paymentMethodId = paymentLine.payment_method_id.id;
                    mockQFPayWebhook(paymentUuid, paymentMethodId, paymentLine.amount, false);
                },
            },
            FeedbackScreen.isShown(),
            FeedbackScreen.clickNextOrder(),

            // REFUND
            Chrome.clickOrders(),
            TicketScreen.selectFilter("Active"),
            TicketScreen.selectFilter("Paid"),
            TicketScreen.selectOrder("0001"),
            TicketScreen.confirmRefund(),
            PaymentScreen.clickPaymentMethod("Qfpay"),
            PaymentScreen.clickRefundButton(),
            {
                content: "Waiting for Qfpay refund to be processed",
                trigger: ".paymentline_status_title:contains('Refund in process')",
                run: async function () {
                    const paymentLine = posmodel.getPendingPaymentLine("qfpay");
                    const paymentMethodId = paymentLine.payment_method_id.id;
                    mockQFPayWebhook(paymentUuid, paymentMethodId, paymentLine.amount, true);
                },
            },
            FeedbackScreen.isShown(),

            Chrome.endTour(),
        ].flat(),
});
