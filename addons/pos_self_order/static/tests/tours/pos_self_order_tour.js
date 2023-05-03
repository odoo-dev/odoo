/** @odoo-module **/

import { registry } from "@web/core/registry";

// TODO: use custom class names for the selectors instead of bootstrap classes
registry.category("web_tour.tours").add("pos_self_order_pay_after_each_tour", {
    test: true,
    steps: [
        {
            content: "Test that the `My Orders` button is not present",
            trigger: "body:not(:has(a:contains('No products found')))",
            isCheck: true,
        },

        ...addProductsToCart([1, 2]),
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
        {
            content: "Go back to the landing page using the navbar back button",
            trigger: "nav.o_self_order_navbar > button",
        },
        // We should now be on the Langind Page

        // We will now repeat the same steps as above, ordering again.
        // The idea is to test that the previous order is not present in the cart
        // and that the previous order is present in the `My Orders` screen
        // along with the new order.

        {
            content: "Test that the default `View Menu` button is present",
            trigger: ".btn",
        },
        // We should now be on the product list screen
        ...addProductsToCart([3, 4]),
        // We should now be on the cart screen
        ...[1, 2].map(() => [
            {
                content: "Test that the n^th item is not in the cart",
                // TODO: add trigger
                isCheck: true,
            },
        ]),

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
            content: "Test that the 1st item is in the 1st order",
            // TODO: add trigger
            isCheck: true,
        },
        {
            content: "Test that the 2nd item is in the 1st order",
            // TODO: add trigger
            isCheck: true,
        },
        {
            content: "Test that the 3rd item is in the 2nd order",
            // TODO: add trigger
            isCheck: true,
        },
        {
            content: "Test that the 4th item is in the 2nd order",
            // TODO: add trigger
            isCheck: true,
        },
    ],
});

function addProductsToCart(product_ids) {
    return [
        {
            content: "Test that the default `View Menu` button is present",
            trigger: ".btn",
        },
        // We should now be on the product list screen
        ...product_ids.map((id) => [
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
        ]),
        // We should now be on the product list screen
        {
            content: "View Cart",
            // TODO: add a class name to the button
            trigger: ".btn",
        },
        // We should now be on the cart screen
        ...product_ids.map((id) => [
            {
                content: "Test that the n^th item is in the cart",
                // TODO: add trigger
                isCheck: true,
            },
        ]),
    ];
}
