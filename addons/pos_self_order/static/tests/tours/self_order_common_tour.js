import { registry } from "@web/core/registry";
import * as Utils from "@pos_self_order/../tests/tours/utils/common";
import * as LandingPage from "@pos_self_order/../tests/tours/utils/landing_page_util";
import * as ProductPage from "@pos_self_order/../tests/tours/utils/product_page_util";

registry.category("web_tour.tours").add("test_self_order_products_sorting_order", {
    steps: () => [
        LandingPage.isClosed(),
        Utils.clickBtn("Order Now"),
        LandingPage.selectLocation("Test-Takeout"),
        ProductPage.checkNthProduct(1, "Free"),
        ProductPage.checkNthProduct(2, "Desk Organizer"),
        ProductPage.checkNthProduct(3, "Ketchup"),
        ProductPage.checkNthProduct(4, "Fanta"),
        ProductPage.checkNthProduct(5, "Coca-Cola"),
    ],
});
