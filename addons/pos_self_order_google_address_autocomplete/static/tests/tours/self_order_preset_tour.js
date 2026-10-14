import { registry } from "@web/core/registry";
import * as Utils from "@pos_self_order/../tests/tours/utils/common";
import * as CartPage from "@pos_self_order/../tests/tours/utils/cart_page_util";
import * as LandingPage from "@pos_self_order/../tests/tours/utils/landing_page_util";
import * as ProductPage from "@pos_self_order/../tests/tours/utils/product_page_util";

registry.category("web_tour.tours").add("self_order_preset_delivery_tour", {
    steps: () => [
        Utils.clickBtn("Order Now"),
        LandingPage.selectLocation("Delivery"),
        ProductPage.clickProduct("Free"),
        Utils.clickBtn("Checkout"),
        CartPage.checkProduct("Free", "0", "1"),
        Utils.clickBtn("Order"),
        CartPage.fillInput("Name", "Dr Dre"),
        CartPage.fillInput("Email", "dre@dr.com"),
        CartPage.fillInput("Phone", "490904390"),
        CartPage.fillInput("Address", "Rue du Bronx"),
        {
            trigger: ".o-autocomplete--dropdown-menu .dropdown-item:contains('Rue du Bronx')",
            run: "click",
        },
        Utils.clickBtn("Continue"),
        Utils.checkConfirmationString(),
        Utils.clickBtn("Ok"),

        // Second order: delivery address rejected (mock returns "too far")
        Utils.checkIsNoBtn("My Order"),
        Utils.clickBtn("Order Now"),
        LandingPage.selectLocation("Delivery"),
        ProductPage.clickProduct("Free"),
        Utils.clickBtn("Checkout"),
        CartPage.checkProduct("Free", "0", "1"),
        Utils.clickBtn("Order"),
        CartPage.fillInput("Name", "Dr Dre"),
        CartPage.fillInput("Email", "dre@dr.com"),
        CartPage.fillInput("Phone", "490904390"),
        CartPage.fillInput("Address", "Rue du Bronx"),
        {
            trigger: ".o-autocomplete--dropdown-menu .dropdown-item:contains('Rue du Bronx')",
            run: "click",
        },
        Utils.clickBtn("Continue"),
        {
            trigger: "p.text-danger:contains('Delivery isn\u2019t available')",
        },
        {
            trigger: "button:contains('Takeaway')",
            run: "click",
        },
        Utils.clickBtn("Continue"),
        Utils.checkConfirmationString(),
        Utils.clickBtn("Ok"),
    ],
});
