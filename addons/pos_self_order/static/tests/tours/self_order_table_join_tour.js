/* global posmodel */

import { registry } from "@web/core/registry";
import { rpc } from "@web/core/network/rpc";
import * as Utils from "@pos_self_order/../tests/tours/utils/common";
import * as CartPage from "@pos_self_order/../tests/tours/utils/cart_page_util";
import * as ProductPage from "@pos_self_order/../tests/tours/utils/product_page_util";
import * as ConfirmationPage from "@pos_self_order/../tests/tours/utils/confirmation_page_util";
import * as Notification from "@point_of_sale/../tests/generic_helpers/notification_util";

/**
 * Answers a join request of the table as another device would do. The tests use the
 * table session of the device running the tour, which is valid for the whole table.
 */
function guestActionFromOtherDevice(params) {
    return rpc("/pos-self-order/table/guest-action", {
        access_token: posmodel.access_token,
        table_identifier: posmodel.currentTableIdentifier,
        table_session_token: posmodel._getTableSessionToken(),
        ...params,
    });
}

function orderCocaCola() {
    return [
        Utils.clickBtn("Order Now"),
        ProductPage.clickProduct("Coca-Cola"),
        Utils.clickBtn("Checkout"),
        CartPage.checkProduct("Coca-Cola", "2.53", "1"),
        Utils.clickBtn("Order"),
        ConfirmationPage.isShown(),
        Utils.clickBtn("Ok"),
    ];
}

registry.category("web_tour.tours").add("self_order_table_join_guest", {
    steps: () =>
        [
            {
                content: "The table is hosted by another guest: ask to join it",
                trigger: ".o_table_join_join .btn-primary:contains('Request to Join')",
                run: "click",
            },
            {
                content: "The request waits for the approval of the table lead",
                trigger: ".o_table_join_waiting h2:contains('Waiting for approval')",
            },
            {
                content: "The table lead approves the request from its phone",
                trigger: ".o_table_join_waiting h2",
                run: () =>
                    guestActionFromOtherDevice({
                        action: "approve",
                        guest_token: "guest_lead",
                        request_id: posmodel.pendingJoinRequestId,
                    }),
            },
            Notification.has("You have been approved to join the table!"),
            {
                content: "The approval closes the waiting popup",
                trigger: Utils.negate(".self_order_table_join_popup"),
            },
            // Approved guests are sent to the menu and can order on the shared table order
            ProductPage.clickProduct("Coca-Cola"),
            Utils.clickBtn("Checkout"),
            Utils.clickBtn("Order"),
            ConfirmationPage.isShown(),
            Utils.clickBtn("Ok"),
        ].flat(),
});

registry.category("web_tour.tours").add("self_order_table_join_lead", {
    steps: () =>
        [
            // The first guest ordering on the table becomes its lead
            ...orderCocaCola(),
            {
                content: "Another guest asks to join the table",
                trigger: "body",
                run: () =>
                    guestActionFromOtherDevice({ action: "request", guest_token: "guest_friend" }),
            },
            {
                content: "The lead allows the guest",
                trigger: ".o_table_join_approve .btn-primary:contains('Allow')",
                run: "click",
            },
            {
                content: "The popup is closed",
                trigger: Utils.negate(".self_order_table_join_popup"),
            },
        ].flat(),
});
