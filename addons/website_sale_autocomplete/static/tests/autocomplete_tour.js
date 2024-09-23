/** @odoo-module */

import { registry } from "@web/core/registry";
import * as tourUtils from "@website_sale/js/tours/tour_utils";

registry.category("web_tour.tours").add("autocomplete_tour", {
    test: true,
    url: "/shop", // /shop/address is redirected if no sales order
    steps: () => [
        ...tourUtils.addToCart({ productName: "A test product" }),
        tourUtils.goToCart(),
        tourUtils.goToCheckout(),
        {
            // Actual test
            content: "Input in Street & Number field",
            trigger: 'input[name="street"]',
            run: "edit This is a test",
        },
        {
            content: "Check if results have appeared",
            trigger: ".js_autocomplete_result",
        },
        {
            content: "Input again in street field",
            trigger: 'input[name="street"]',
            run: "fill add more",
        },
        {
            content: "Click on the first result",
            trigger: ".dropdown-menu .js_autocomplete_result:first:contains(result 0)",
            run: "click",
        },
        {
            content: "Check the value of input has been updated",
            trigger: "input[name=street]:value(/^42 A fictional Street$/)",
        },
        {
            content: "Check City is not empty anymore",
            trigger: 'input[name="city"]:value(/^A Fictional City$/)',
        },
        {
            content: "Check Zip code is not empty anymore",
            trigger: 'input[name="zip"]:value(/^12345$/)',
        },
        {
            content: "Verify the autocomplete box disappeared",
            trigger: "body:not(:has(.js_autocomplete_result))",
        },
    ],
});
