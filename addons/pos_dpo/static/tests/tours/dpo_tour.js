import * as Chrome from "@point_of_sale/../tests/pos/tours/utils/chrome_util";
import * as ProductScreen from "@point_of_sale/../tests/pos/tours/utils/product_screen_util";
import * as PaymentScreen from "@point_of_sale/../tests/pos/tours/utils/payment_screen_util";
// import * as TicketScreen from "@point_of_sale/../tests/pos/tours/utils/ticket_screen_util";
import * as ReceiptScreen from "@point_of_sale/../tests/pos/tours/utils/receipt_screen_util";
import * as Dialog from "@point_of_sale/../tests/generic_helpers/dialog_util";
import { registry } from "@web/core/registry";
import * as Notification from "@point_of_sale/../tests/generic_helpers/notification_util";

registry.category("web_tour.tours").add("PosDpoPayTour", {
    steps: () =>
        [
            Chrome.startPoS(),
            Dialog.confirm("Open Register"),
            ProductScreen.addOrderline("Desk Pad"),
            ProductScreen.clickPayButton(),
            PaymentScreen.clickPaymentMethod("DPO by Network"),
            ReceiptScreen.isShown(),
        ].flat(),
});

registry.category("web_tour.tours").add("PosDpoPayCancelTour", {
    steps: () =>
        [
            Chrome.startPoS(),
            Dialog.confirm("Open Register"),
            ProductScreen.addOrderline("Desk Pad"),
            ProductScreen.clickPayButton(),
            PaymentScreen.clickPaymentMethod("DPO by Network"),
            PaymentScreen.clickCancelButton(),
            Notification.has("Transaction has cancelled"),
            PaymentScreen.isShown(),
            PaymentScreen.clickRetryButton(),
            ReceiptScreen.isShown(),
        ].flat(),
});
