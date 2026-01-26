/** @odoo-module */

import { registry } from "@web/core/registry";
import { stepUtils } from "@point_of_sale/../tests/tours/utils/step_utils";
// import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";

registry.category("web_tour.tours").add("pos_service_charge_hk", {
    test: true,
    url: "/pos/ui",
    steps: () => [
        stepUtils.confirmOpeningStatus(),
        stepUtils.addProductToOrder("Test Product"),
        // Product Price: 100
        // Service Charge: 10% -> 10.0
        // Total: 110.0
        {
            content: "Check Total with Service Charge",
            trigger: ".pos-receipt-container .total-price:contains('110.00')",
            run: "click",
        },
        // We can also check the order lines if necessary
        {
             content: "Verify Service Charge Line",
             trigger: ".orderline:contains('Service Charge')",
        },
        stepUtils.pay(),
    ],
});
