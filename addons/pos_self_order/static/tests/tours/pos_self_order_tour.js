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
        {
            content: "Test that the default `View Menu` button is present",
            trigger: ".btn",
        },
        // We should now be on the product list screen
        ...addProductsToCart([1, 2]),
        {
            content: "View Cart",
            // TODO: add a class name to the button
            trigger: ".btn",
        },
        ...checkThatProductsAreInCart([1, 2]),
        {
            content: "Order",
            // TODO: add a class name to the button
            trigger: ".btn",
        },

        // We should now be on the landing page screen ( because ordering redirects to the landing page )
        {
            content: "Go to `My Orders`",
            trigger: "a:contains('My Orders')",
        },
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
        ...clickOnBackButton(),
        // We should now be on the Landing Page

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
        ...clickOn("View Cart"),
        // We should now be on the cart screen
        [1, 2].map((id) => ({
            content: `Test that Product ${id} is not in the cart`,
            trigger: `body:not(:has(p:contains('Product ${id}')))`,
            isCheck: true,
        })),

        ...clickOn("Order"),
        // We should now be on the landing page screen
        ...clickOn("My Orders"),
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

// HELPERS ////////////////////////////////
// Each of the functions below returns an array of steps
// (even those that return a single step, for consistency)

/**
 * START: product list screen
 * END: product list screen
 * @param {int[]} product_ids
 * @returns Array of steps
 */
function addProductsToCart(product_ids) {
    return product_ids
        .map((id) => [
            {
                content: `Go to the Product Main View of Product ${id}`,
                trigger: `p:contains('Product ${id}')`,
            },
            // We should now be on the product main view screen
            {
                content: "Add product to cart",
                // TODO: add a class name to the button
                trigger: ".btn",
            },
            // We should now be on the product list screen
        ])
        .flat();
}

/**
 * START: cart screen
 * END: cart screen
 * @param {int[]} product_ids
 * @returns Array of steps
 */
function checkThatProductsAreInCart(product_ids) {
    return product_ids.map((id) => ({
        content: `Test that Product ${id} is in the cart`,
        trigger: `p:contains('Product ${id}')`,
        isCheck: true,
    }));
}

/**
 * @returns Array of steps
 */
function clickOnBackButton() {
    return [
        {
            content: "Click the navbar back button",
            trigger: "nav.o_self_order_navbar > button",
        },
    ];
}

function clickOn(element) {
    return [
        {
            content: `Click on '${element}' button`,
            trigger: `.btn:contains('${element}')`,
        },
    ];
}
