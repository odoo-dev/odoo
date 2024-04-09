/** @odoo-module */

import * as ProductScreen from "@point_of_sale/../tests/tours/utils/product_screen_util";
import * as Numpad from "@point_of_sale/../tests/tours/utils/numpad_util";
import * as ReceiptScreen from "@point_of_sale/../tests/tours/utils/receipt_screen_util";
import * as PaymentScreen from "@point_of_sale/../tests/tours/utils/payment_screen_util";
import * as PartnerList from "@point_of_sale/../tests/tours/utils/partner_list_util";
import * as TicketScreen from "@point_of_sale/../tests/tours/utils/ticket_screen_util";
import * as Order from "@point_of_sale/../tests/tours/utils/generic_components/order_widget_util";
import * as Chrome from "@point_of_sale/../tests/tours/utils/chrome_util";
import * as Dialog from "@point_of_sale/../tests/tours/utils/dialog_util";
import { inLeftSide } from "@point_of_sale/../tests/tours/utils/common";
import { registry } from "@web/core/registry";

registry.category("web_tour.tours").add("TicketScreenTour", {
    test: true,
    steps: () =>
        [
            Dialog.confirm("Open session"),
            Chrome.clickMenuButton(),
            Chrome.clickTicketButton(),
            TicketScreen.clickNewTicket(),
            ProductScreen.clickShowProductsMobile(),
            ProductScreen.addOrderline("Desk Pad", "1", "3"),
            Chrome.clickMenuButton(),
            Chrome.clickTicketButton(),
            TicketScreen.deleteOrder("-0002"),
            Dialog.confirm(),
            TicketScreen.clickDiscard(),
            ProductScreen.isOrderEmpty(),
            ProductScreen.addOrderline("Desk Pad", "1", "2"),
            Chrome.clickMenuButton(),
            Chrome.clickTicketButton(),
            TicketScreen.deleteOrder("-0001"),
            Dialog.confirm(),
            TicketScreen.clickDiscard(),
            Chrome.clickMenuButton(),
            Chrome.clickTicketButton(),
            TicketScreen.nthRowContains(2, "-0003"),
            TicketScreen.clickDiscard(),
            ProductScreen.addOrderline("Desk Pad", "1", "2"),
            ProductScreen.clickPartnerButton(),
            ProductScreen.clickCustomer("Partner Test 1"),
            Chrome.clickMenuButton(),
            Chrome.clickTicketButton(),
            TicketScreen.nthRowContains(2, "Partner Test 1", false),
            TicketScreen.clickNewTicket(),
            ProductScreen.addOrderline("Desk Pad", "1", "3"),
            ProductScreen.clickPartnerButton(),
            ProductScreen.clickCustomer("Partner Test 2"),
            ProductScreen.clickPayButton(),
            PaymentScreen.isShown(),
            Chrome.clickMenuButton(),
            Chrome.clickTicketButton(),
            TicketScreen.nthRowContains(3, "Partner Test 2", false),
            TicketScreen.clickNewTicket(),
            ProductScreen.addOrderline("Desk Pad", "2", "4"),
            ProductScreen.clickPayButton(),
            PaymentScreen.clickPaymentMethod("Bank"),
            PaymentScreen.clickValidate(),
            ReceiptScreen.isShown(),
            Chrome.clickMenuButton(),
            Chrome.clickTicketButton(),
            TicketScreen.nthRowContains(4, "Receipt"),
            TicketScreen.selectFilter("Receipt"),
            TicketScreen.nthRowContains(2, "Receipt"),
            TicketScreen.selectFilter("Payment"),
            TicketScreen.nthRowContains(2, "Payment"),
            TicketScreen.selectFilter("Ongoing"),
            TicketScreen.nthRowContains(2, "Ongoing"),
            TicketScreen.selectFilter("All active orders"),
            TicketScreen.nthRowContains(4, "Receipt"),
            TicketScreen.search("Receipt Number", "-0005"),
            TicketScreen.nthRowContains(2, "Receipt"),
            TicketScreen.search("Customer", "Partner Test 1"),
            TicketScreen.nthRowContains(2, "Partner Test 1", false),
            TicketScreen.search("Customer", "Partner Test 2"),
            TicketScreen.nthRowContains(2, "Partner Test 2", false),
            // Close the TicketScreen to see the current order which is in ReceiptScreen.
            // This is just to remove the search string in the search bar.
            TicketScreen.clickDiscard(),
            ReceiptScreen.isShown(),
            // Open again the TicketScreen to check the Paid filter.
            Chrome.clickMenuButton(),
            Chrome.clickTicketButton(),
            TicketScreen.selectFilter("Paid"),
            TicketScreen.nthRowContains(2, "-0005"),
            TicketScreen.selectOrder("-0005"),
            TicketScreen.clickControlButton("Print Receipt"),
            TicketScreen.isReceiptTotalValueIs("8.00"),
            ReceiptScreen.clickBack(),
            TicketScreen.clickBackToMainTicketScreen(),
            // Pay the order that was in PaymentScreen.
            TicketScreen.selectFilter("Payment"),
            TicketScreen.selectOrder("-0004"),
            TicketScreen.loadSelectedOrder(),
            PaymentScreen.clickPaymentMethod("Cash"),
            PaymentScreen.clickValidate(),
            ReceiptScreen.isShown(),
            ReceiptScreen.clickNextOrder(),
            ProductScreen.isShown(),
            // Check that the Paid filter will show the 2 synced orders.
            Chrome.clickMenuButton(),
            Chrome.clickTicketButton(),
            TicketScreen.selectFilter("Paid"),
            TicketScreen.nthRowContains(2, "Partner Test 2", false),
            TicketScreen.nthRowContains(3, "-0005"),
            // Invoice order
            TicketScreen.selectOrder("-0005"),
            inLeftSide(Order.hasLine()),
            TicketScreen.clickControlButton("Invoice"),
            Dialog.confirm(),
            PartnerList.clickPartner("Partner Test 3"),
            TicketScreen.invoicePrinted(),
            TicketScreen.clickBackToMainTicketScreen(),
            // Reprint receipt
            TicketScreen.clickControlButton("Print Receipt"),
            ReceiptScreen.isShown(),
            ReceiptScreen.clickBack(),
            TicketScreen.clickBackToMainTicketScreen(),
            // When going back, the ticket screen should be in its previous state.
            TicketScreen.isFilterIs("Paid"),
            // Test refund //
            TicketScreen.clickDiscard(),
            ProductScreen.isShown(),
            ProductScreen.isOrderEmpty(),
            ...ProductScreen.clickRefund(),
            //Filter should be automatically 'Paid'.
            TicketScreen.isFilterIs("Paid"),
            TicketScreen.selectOrder("-0005"),
            inLeftSide([
                ...Order.hasLine({ productName: "Desk Pad", withClass: ".selected" }),
                Numpad.click("3"),
                Dialog.confirm(),
            ]),
            TicketScreen.clickDiscard(),
            ProductScreen.goBackToMainScreen(),
            ProductScreen.isShown(),
            ProductScreen.isOrderEmpty(),
            ...ProductScreen.clickRefund(),
            TicketScreen.selectOrder("-0005"),
            inLeftSide(Order.hasLine({ productName: "Desk Pad", withClass: ".selected" })),
            ProductScreen.clickNumpad("1"),
            TicketScreen.isToRefundTextIs("To Refund: 1.00"),
            TicketScreen.clickConfirmRefund(),
            ProductScreen.goBackToMainScreen(),
            ProductScreen.isShown(),
            ProductScreen.isSelectedOrderlineHas("Desk Pad", "-1.00"),
            inLeftSide([
                // Try changing the refund line to positive number.
                // Error popup should show.
                Numpad.click("2"),
                Dialog.confirm(),
                // Change the refund line quantity to -3 -- not allowed
                // so error popup.
                ...["+/-", "3"].map(Numpad.click),
                Dialog.confirm(),
            ]),
            // Change the refund line quantity to -2 -- allowed.
            ProductScreen.clickNumpad("+/-", "2"),
            ProductScreen.isSelectedOrderlineHas("Desk Pad", "-2.00"),
            // Check if the amount being refunded changed to 2.
            ...ProductScreen.clickRefund(),
            TicketScreen.selectOrder("-0005"),
            TicketScreen.isToRefundTextIs("Refunding 2.00"),
            TicketScreen.clickDiscard(),
            ProductScreen.goBackToMainScreen(),
            // Pay the refund order.
            ProductScreen.clickPayButton(),
            PaymentScreen.clickPaymentMethod("Bank"),
            PaymentScreen.clickValidate(),
            ReceiptScreen.isShown(),
            ReceiptScreen.clickNextOrder(),
            // Check refunded quantity.
            ...ProductScreen.clickRefund(),
            TicketScreen.selectOrder("-0005"),
            TicketScreen.isRefundedNoteContains("2.00 Refunded"),
        ].flat(),
});

registry.category("web_tour.tours").add("FiscalPositionNoTaxRefund", {
    test: true,
    steps: () =>
        [
            Dialog.confirm("Open session"),
            ProductScreen.clickShowProductsMobile(),
            ProductScreen.clickDisplayedProduct("Product Test"),
            ProductScreen.totalAmountIs("100.00"),
            ProductScreen.clickFiscalPosition("No Tax"),
            ProductScreen.totalAmountIs("86.96"),
            ProductScreen.clickPayButton(),
            PaymentScreen.clickPaymentMethod("Bank", true, { remaining: "0.00" }),
            PaymentScreen.clickValidate(),
            ReceiptScreen.isShown(),
            ReceiptScreen.clickNextOrder(),
            ...ProductScreen.clickRefund(),
            TicketScreen.selectOrder("-0001"),
            ProductScreen.clickNumpad("1"),
            TicketScreen.isToRefundTextIs("To Refund: 1.00"),
            TicketScreen.clickConfirmRefund(),
            ProductScreen.isShown(),
            ProductScreen.goBackToMainScreen(),
            ProductScreen.totalAmountIs("-86.96"),
        ].flat(),
});

registry.category("web_tour.tours").add("LotRefundTour", {
    test: true,
    steps: () =>
        [
            Dialog.confirm("Open session"),
            ProductScreen.clickShowProductsMobile(),
            ProductScreen.clickDisplayedProduct("Product A"),
            ProductScreen.enterLotNumber("123456789"),
            ProductScreen.isSelectedOrderlineHas("Product A", "1.00"),
            ProductScreen.clickPayButton(),
            PaymentScreen.clickPaymentMethod("Bank"),
            PaymentScreen.clickValidate(),
            ReceiptScreen.isShown(),
            ReceiptScreen.clickNextOrder(),
            ...ProductScreen.clickRefund(),
            TicketScreen.selectOrder("-0001"),
            ProductScreen.clickNumpad("1"),
            TicketScreen.isToRefundTextIs("To Refund: 1.00"),
            TicketScreen.clickConfirmRefund(),
            ProductScreen.isShown(),
            ProductScreen.clickLotIcon(),
            ProductScreen.checkFirstLotNumber("123456789"),
        ].flat(),
});
