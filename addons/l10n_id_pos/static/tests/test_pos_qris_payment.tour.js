import * as ProductScreen from "@point_of_sale/../tests/pos/tours/utils/product_screen_util";
import * as PaymentScreen from "@point_of_sale/../tests/pos/tours/utils/payment_screen_util";
import * as Dialog from "@point_of_sale/../tests/generic_helpers/dialog_util";
import * as FeedbackScreen from "@point_of_sale/../tests/pos/tours/utils/feedback_screen_util";
import * as Chrome from "@point_of_sale/../tests/pos/tours/utils/chrome_util";

import { registry } from "@web/core/registry";

function isQRDisplayedinDialog() {
    return [
        {
            content: "Verify QR image is displayed",
            trigger: ".modal-content img[src^='data:image/svg+xml;base64,']",
            run: "click",
        },
    ].flat();
}

function addProductandPay() {
    return [
        ProductScreen.addOrderline("Test Product"),
        ProductScreen.selectedOrderlineHas("Test Product"),
        ProductScreen.clickPayButton(),

        PaymentScreen.totalIs("1,000.00"),
        PaymentScreen.clickPaymentMethod("QRIS", true, { amount: "1,000.00" }),
    ].flat();
}

registry.category("web_tour.tours").add("PaymentScreenQRISPaymentFail", {
    steps: () =>
        [
            Chrome.startPoS(),
            Dialog.confirm("Open Register"),
            addProductandPay(),
            isQRDisplayedinDialog(),
            Dialog.confirm(),
            Dialog.is({ title: "Payment Status Update" }),
        ].flat(),
});

registry.category("web_tour.tours").add("PaymentScreenQRISPaymentSuccess", {
    steps: () =>
        [
            Chrome.startPoS(),
            Dialog.confirm("Open Register"),
            addProductandPay(),
            isQRDisplayedinDialog(),
            Dialog.confirm(),
            FeedbackScreen.clickNextOrder(),
        ].flat(),
});

registry.category("web_tour.tours").add("PayementScreenQRISFetchQR", {
    steps: () =>
        [
            Chrome.startPoS(),
            Dialog.confirm("Open Register"),
            addProductandPay(),
            isQRDisplayedinDialog(),
            Dialog.discard(),
            PaymentScreen.clickPaymentMethod("QRIS", true),
            isQRDisplayedinDialog(),
            Dialog.discard(),
            PaymentScreen.clickRetryButton(),
            isQRDisplayedinDialog(),
        ].flat(),
});

registry.category("web_tour.tours").add("PayementScreenQRISChangeAmount", {
    steps: () =>
        [
            Chrome.startPoS(),
            addProductandPay(),
            isQRDisplayedinDialog(),
            Dialog.discard(),
            PaymentScreen.clickBack(),
            ProductScreen.clickDisplayedProduct("Test Product"),
            ProductScreen.clickPayButton(),
            PaymentScreen.clickPaymentlineDelButton("QRIS", "1,000.00"),
            PaymentScreen.clickPaymentMethod("QRIS", true, { amount: "2,000.00" }),
            isQRDisplayedinDialog(),
            Dialog.discard(),
            PaymentScreen.clickRetryButton(),
            isQRDisplayedinDialog(),
        ].flat(),
});

// Call the QRIS webhook as QRIS does when the QR code is paid (token accepted by the test)
function mockQrisWebhook() {
    return [
        {
            content: "Notify the QRIS payment through the webhook",
            trigger: "body",
            run: async () => {
                const response = await fetch("/l10n_id/qris/webhook/test_token", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ invoice: "413255111", qris_status: "success" }),
                });
                if (!response.ok) {
                    throw new Error("Failed to notify the QRIS webhook");
                }
            },
        },
    ];
}

registry.category("web_tour.tours").add("PaymentScreenQRISWebhookPayment", {
    steps: () =>
        [
            Chrome.startPoS(),
            Dialog.confirm("Open Register"),
            addProductandPay(),
            isQRDisplayedinDialog(),
            mockQrisWebhook(),
            FeedbackScreen.isShown(),
            FeedbackScreen.clickNextOrder(),
        ].flat(),
});

registry.category("web_tour.tours").add("PaymentScreenQRISPaidAfterDiscard", {
    steps: () =>
        [
            Chrome.startPoS(),
            Dialog.confirm("Open Register"),
            addProductandPay(),
            isQRDisplayedinDialog(),
            Dialog.discard(),
            mockQrisWebhook(),
            PaymentScreen.clickRetryButton(),
            FeedbackScreen.isShown(),
            FeedbackScreen.clickNextOrder(),
        ].flat(),
});
