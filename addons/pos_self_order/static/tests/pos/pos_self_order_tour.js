import * as ProductScreenPos from "@point_of_sale/../tests/pos/tours/utils/product_screen_util";
import * as PaymentScreen from "@point_of_sale/../tests/pos/tours/utils/payment_screen_util";
import * as ProductScreenResto from "@pos_restaurant/../tests/tours/utils/product_screen_util";
const ProductScreen = { ...ProductScreenPos, ...ProductScreenResto };
import * as TicketScreen from "@point_of_sale/../tests/pos/tours/utils/ticket_screen_util";
import * as Chrome from "@point_of_sale/../tests/pos/tours/utils/chrome_util";
import * as FloorScreen from "@pos_restaurant/../tests/tours/utils/floor_screen_util";
import * as Dialog from "@point_of_sale/../tests/generic_helpers/dialog_util";
import { registry } from "@web/core/registry";

registry.category("web_tour.tours").add("test_pos_self_order_preparation_changes", {
    steps: () =>
        [
            Chrome.startPoS(),
            Chrome.clickOrders(),
            TicketScreen.checkStatus("Self-order", "Ongoing"),
            TicketScreen.selectOrder("Self-order"),
            TicketScreen.loadSelectedOrder(),
            ProductScreen.isShown(),
            ProductScreen.orderlinesHaveNoChange(),
            ProductScreen.clickPayButton(),
            PaymentScreen.clickValidate(),
        ].flat(),
});

registry.category("web_tour.tours").add("test_pos_self_order_dynamic_qr", {
    steps: () =>
        [
            Chrome.startPoS(),
            FloorScreen.clickTable("1"),
            ProductScreen.clickDisplayedProduct("Coca-Cola"),
            ProductScreen.clickControlButton("Dynamic QR"),
            {
                content: "Dynamic QR popup is shown with a QR code",
                trigger: ".o_qr_popup img.qr-code",
            },
            {
                content: "Close the Dynamic QR popup",
                trigger: ".o_qr_popup .btn-secondary:contains('Close')",
                run: "click",
            },
            Chrome.flushPendingOrdersSync(),
        ].flat(),
});

registry.category("web_tour.tours").add("test_self_order_snooze_service", {
    steps: () =>
        [
            Chrome.startPoS(),
            Chrome.toggleOrderStatus(),
            Chrome.snoozeServiceForHours(1),
            Dialog.confirm("Apply"),
        ].flat(),
});

registry.category("web_tour.tours").add("test_pos_table_join_request_approval", {
    steps: () =>
        [
            Chrome.startPoS(),
            {
                content: "The table shows the pending join request",
                trigger: ".floor-table .o_table_join_requests_badge:contains('1')",
                run: "click",
            },
            {
                content: "The request is listed in the dialog",
                trigger: ".o_table_join_requests_dialog .o_table_join_request:contains('Guest 1')",
            },
            {
                content: "Approve the guest",
                trigger: ".o_table_join_request .btn-success",
                run: "click",
            },
            {
                content: "The badge is removed once the request is answered",
                trigger: "body:not(:has(.o_table_join_requests_badge))",
            },
        ].flat(),
});
