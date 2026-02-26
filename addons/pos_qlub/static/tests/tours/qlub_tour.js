/* global posmodel */

import * as Chrome from "@point_of_sale/../tests/pos/tours/utils/chrome_util";
import * as FeedbackScreen from "@point_of_sale/../tests/pos/tours/utils/feedback_screen_util";
import * as PaymentScreen from "@point_of_sale/../tests/pos/tours/utils/payment_screen_util";
import * as ProductScreen from "@point_of_sale/../tests/pos/tours/utils/product_screen_util";
import * as Dialog from "@point_of_sale/../tests/generic_helpers/dialog_util";

import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { mockQlubWebhook } from "@pos_qlub/../tests/tours/utils/common";

const { DateTime } = luxon;
const TRANSACTION_TIMESTAMP = 1772251200;

const commonSetups = [
    Chrome.freezeDateTime(DateTime.fromSeconds(TRANSACTION_TIMESTAMP).toMillis()),
    Chrome.startPoS(),
    Dialog.confirm("Open Register"),
    ProductScreen.addOrderline("Desk Pad"),
];

const mockQlubWebhookStep = (action, success) => ({
    content: "Manually mock and send the request from Qlub's PoS Worker",
    trigger: ".electronic_status:contains('Waiting for card')",
    run: async function () {
        const paymentLine = posmodel.getPendingPaymentLine("qlub");
        await mockQlubWebhook(
            action,
            paymentLine.id,
            posmodel.config.id,
            paymentLine.pos_order_id.id,
            paymentLine.amount,
            success
        );
    },
});

registry.category("web_tour.tours").add("qlub_transaction_creation_success", {
    steps: () =>
        [
            ...commonSetups,
            ProductScreen.clickPayButton(),
            PaymentScreen.clickPaymentMethod("Qlub"),
            mockQlubWebhookStep("result", true),
            FeedbackScreen.isShown(),
        ].flat(),
});

registry.category("web_tour.tours").add("qlub_transaction_creation_failed", {
    steps: () =>
        [
            ...commonSetups,
            ProductScreen.clickPayButton(),
            PaymentScreen.clickPaymentMethod("Qlub"),
            Dialog.bodyIs("Qlub server cannot process the transaction. Please retry."),
        ].flat(),
});

registry.category("web_tour.tours").add("qlub_transaction_creation_failed_notification", {
    steps: () =>
        [
            ...commonSetups,
            ProductScreen.clickPayButton(),
            PaymentScreen.clickPaymentMethod("Qlub"),
            mockQlubWebhookStep("result", false),
            Dialog.bodyIs(
                "Qlub transaction failed. Please try again or use another payment method."
            ),
        ].flat(),
});

registry.category("web_tour.tours").add("qlub_transaction_cancel_from_terminal", {
    steps: () =>
        [
            ...commonSetups,
            ProductScreen.clickPayButton(),
            PaymentScreen.clickPaymentMethod("Qlub"),
            mockQlubWebhookStep("cancel"),
            Dialog.bodyIs(_t("Qlub transaction has been cancelled from the terminal.")),
        ].flat(),
});

registry.category("web_tour.tours").add("qlub_transaction_cancel_from_pos", {
    steps: () =>
        [
            ...commonSetups,
            ProductScreen.clickPayButton(),
            PaymentScreen.clickPaymentMethod("Qlub"),
            {
                // We need to wait a bit here since the next step might run
                // before the initial request is made and prevPaymentLine = paymentLine; is executed
                // Without waiting, prevPaymentLine and paymentLine will be undefined
                // and triggers an error when we read paymentLine.id
                content: "Wait a bit before pressing the cancel button",
                trigger: ".electronic_status:contains('Waiting for card')",
                run: async () => new Promise((resolve) => setTimeout(resolve, 100)),
            },
            PaymentScreen.clickCancelButton(),
            {
                content: "Check if the transaction is really cancelled",
                trigger: ".electronic_status:contains('Transaction cancelled')",
            },
            Dialog.isNot(), // there shouldn't be any notification from the Qlub's PoS worker if we initiate the cancellation
        ].flat(),
});
