/** @odoo-module **/

import { registry } from "@web/core/registry";
import { PosSelf } from "./tour_utils";

registry.category("web_tour.tours").add("self_order_after_meal_cart_tour", {
    test: true,
    steps: () => [
        // Verify if the self is open and My Orders is not displayed because we are in "meal" mode
        PosSelf.check.isNotNotification(),
        PosSelf.check.isNotPrimaryBtn("My Orders"),
        PosSelf.action.clickPrimaryBtn("View Menu"),

        // Cancel an orders
        ...PosSelf.action.addProduct("Office Chair Black", 1),
        ...PosSelf.action.addProduct("Office Chair Black", 2, "Description"),
        ...PosSelf.action.addProduct("Desk Stand with Screen", 2),
        PosSelf.action.clickPrimaryBtn("Review"),
        ...PosSelf.action.cancelOrder(),
        PosSelf.action.clickPrimaryBtn("View Menu"),

        // Add some products
        ...PosSelf.action.addProduct("Office Chair Black", 1),
        ...PosSelf.action.addProduct("Office Chair Black", 2, "Description"),
        ...PosSelf.action.addProduct("Desk Stand with Screen", 2),
        PosSelf.action.clickPrimaryBtn("Review"),

        // Here we're looking at whether when an orderline is clicked on from
        // the cart and edited, the changes are made to the orderline clicked on.
        PosSelf.check.isOrderline("Office Chair Black", "138.58", ""),
        ...PosSelf.action.editOrderline("Office Chair Black", "138.58", "", 5, "no wheels"),
        PosSelf.check.isOrderline("Office Chair Black", "692.90", "no wheels"),
        ...PosSelf.action.editOrderline("Office Chair Black", "692.90", "no wheels", -4, "kidding"),
        PosSelf.check.isOrderline("Office Chair Black", "138.58", "kidding"),

        // Send the order to the server
        // Here it's the first time we send an order to the server, so we check the table.
        // if the table is not selected, we check that the table selection popup is displayed.
        // Then we select a table
        PosSelf.action.clickPrimaryBtn("Order"),
        PosSelf.check.tablePopupIsShown(),
        PosSelf.action.selectTable({ id: "1", name: "1" }),
        PosSelf.action.clickPrimaryBtn("Confirm"),
        PosSelf.check.isNotification("Your order has been placed!"),

        // Once an order has been sent to the server, the user can no
        // longer reduce the quantity of his orderlines. We check this behaviour.
        PosSelf.action.clickPrimaryBtn("View Menu"),
        PosSelf.action.clickPrimaryBtn("Review"),
        ...PosSelf.action.editSentOrderline("Desk Stand with Screen", "4,830.00", "", -1),
        PosSelf.check.isNotification("You cannot reduce the quantity"),
        PosSelf.check.isOrderline("Desk Stand with Screen", "4,830.00", ""),

        // Here we look at whether the user can reduce the quantity
        // and delete a product that has not yet been sent
        PosSelf.action.clickBack(),
        ...PosSelf.action.addProduct("Apple Pie", 1),
        PosSelf.action.clickPrimaryBtn("Review"),
        ...PosSelf.action.editOrderline("Apple Pie", "13.80", "", -1),
        PosSelf.check.isNotOrderline("Apple Pie", "13.80", ""),

        // Here we're looking at whether adding a product with the same description
        // as the same product already in the basket merges the two products.
        // We also check whether we can reduce the quantity of the part not yet sent to
        // the server and whether the quantity of the part sent to the server is fixed.
        PosSelf.action.clickBack(),
        ...PosSelf.action.addProduct("Office Chair Black", 1, "kidding"),
        PosSelf.action.clickPrimaryBtn("Review"),
        PosSelf.check.isOrderline("Office Chair Black", "277.16", "kidding"),
        ...PosSelf.action.editSentOrderline("Office Chair Black", "277.16", "kidding", -1),
        PosSelf.check.isOrderline("Office Chair Black", "138.58", "kidding"),
        ...PosSelf.action.editSentOrderline("Office Chair Black", "138.58", "kidding", -1),
        PosSelf.check.isNotification("You cannot reduce the quantity"),
        PosSelf.action.clickBack(),

        // Here we check that the product attributes are correctly selected.
        ...PosSelf.action.addProduct("Casual T-shirt", 1, "kidding", {
            radio: { name: "Size", value: "M" },
            select: { name: "Color", value: "Black" },
        }),
        ...PosSelf.action.addProduct("Casual T-shirt", 2, "okkk", {
            radio: { name: "Size", value: "L" },
            select: { name: "Color", value: "White" },
        }),
        PosSelf.action.clickPrimaryBtn("Review"),
        PosSelf.check.isOrderline("Casual T-shirt", "23.00", "kidding", "M, Black"),
        PosSelf.check.isOrderline("Casual T-shirt", "46.00", "okkk", "L, White"),

        // Check if we can edit the product attributes, and if the changes are made to the orderline
        ...PosSelf.action.editOrderline("Casual T-shirt", "23.00", "kidding", 0, "dav", {
            radio: { name: "Size", value: "S" },
            select: { name: "Color", value: "Purple" },
        }),
        PosSelf.check.isOrderline("Casual T-shirt", "23.00", "dav", "S, Purple"),
        PosSelf.check.isOrderline("Casual T-shirt", "46.00", "okkk", "L, White"),
        PosSelf.action.clickPrimaryBtn("Order"),

        PosSelf.check.isPrimaryBtn("My Orders"),
        PosSelf.action.clickPrimaryBtn("My Orders"),
        PosSelf.action.clickBack(),
    ],
});
