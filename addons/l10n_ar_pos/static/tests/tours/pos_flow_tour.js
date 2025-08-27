import * as Chrome from "@point_of_sale/../tests/tours/utils/chrome_util";
import * as Dialog from "@point_of_sale/../tests/tours/utils/dialog_util";
import * as ProductScreen from "@point_of_sale/../tests/tours/utils/product_screen_util";
import * as PaymentScreen from "@point_of_sale/../tests/tours/utils/payment_screen_util";
import * as ReceiptScreen from "@point_of_sale/../tests/tours/utils/receipt_screen_util";
import * as TicketScreen from "@point_of_sale/../tests/tours/utils/ticket_screen_util";
import { negate } from "@point_of_sale/../tests/tours/utils/common";
import { registry } from "@web/core/registry";

registry.category("web_tour.tours").add("test_l10n_ar_pos_flow", {
    steps: () =>
        [
            Chrome.startPoS(),
            Dialog.confirm("Open Register"),
            ProductScreen.clickDisplayedProduct("Laptop Customized"),
            ProductScreen.totalAmountIs("1.11"),
            ProductScreen.clickPayButton(),
            {
                content: "Check partner selected by default",
                trigger:  negate("button.partner-button .partner-name:contains('Costomer')"),
            },
            PaymentScreen.isInvoiceOptionSelected(),
            PaymentScreen.clickPaymentMethod("Cash"),
            PaymentScreen.clickValidate(),
            ReceiptScreen.isShown(),
            ReceiptScreen.clickNextOrder(),
            ...ProductScreen.clickRefund(),
            TicketScreen.selectOrder("-0001"),
            ProductScreen.clickNumpad("1"),
            TicketScreen.toRefundTextContains("To Refund: 1.00"),
            TicketScreen.confirmRefund(),
            ProductScreen.isShown(),
            ProductScreen.totalAmountIs("-1.11"),
            ProductScreen.clickPayButton(),
            {
                content: "Check partner selected by default",
                trigger:  negate("button.partner-button .partner-name:contains('Costomer')"),
            },
            PaymentScreen.isInvoiceOptionSelected(),
            PaymentScreen.clickPaymentMethod("Cash"),
            PaymentScreen.clickValidate(),
            ReceiptScreen.isShown(),
        ].flat(),
});