/** @odoo-module **/

import { registry } from "@web/core/registry";

// TODO: use custom class names for the selectors instead of bootstrap classes
registry.category("web_tour.tours").add("pos_self_order_tour", {
    test: true,
    steps: [
        {
            content: "Test that the default `View Menu` button is present",
            trigger: ".btn",
        },
        {
            content: "Test that the `My Orders` button is not present",
            trigger: "body:not(:has(a:contains('No products found')))",
        },
        // We should now be on the product list screen
        {
            content: "Go to one of the product's details page",
            // TODO: add trigger to order the 1st product
        },
        // We should now be on the product main view screen
        {
            content: "Add product to cart",
            // TODO: add a class name to the button
            trigger: ".btn",
        },
        // We should now be on the product list screen
        {
            content: "Test that we are back on the product list screen",
            trigger: ".o_self_order_item_card",
            isCheck: true,
        },
        {
            content: "Go to one of the product's details page",
            // TODO: add trigger to order the 2st product
        },
        // We should now be on the product main view screen
        {
            content: "Add product to cart",
            // TODO: add a class name to the button
            trigger: ".btn",
        },
        // We should now be on the product list screen
        {
            content: "View Cart",
            // TODO: add a class name to the button
            trigger: ".btn",
        },
        // We should now be on the cart screen
        {
            content: "Test that the first item is in the cart",
            // TODO: add trigger
            isCheck: true,
        },
        {
            content: "Test that the second item is in the cart",
            // TODO: add trigger
            isCheck: true,
        },
        {
            content: "Order",
            // TODO: add a class name to the button
            trigger: ".btn",
        },
        // We should now be on the landing page screen
        {
            content: "Go to `My Orders`",
            trigger: "a:contains('My Orders')",
        },
        // We should now be on the orders screen
        {
            content: "Test that the first item is in the order",
            // TODO: add trigger
            isCheck: true,
        },
        {
            content: "Test that the second item is in the order",
            // TODO: add trigger
            isCheck: true,
        },




















    ],
});
