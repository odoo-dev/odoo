import { registry } from "@web/core/registry";
import { waitUntil } from "@odoo/hoot-dom";
import * as Chrome from "@point_of_sale/../tests/pos/tours/utils/chrome_util";
import * as Dialog from "@point_of_sale/../tests/generic_helpers/dialog_util";
import * as ProductScreen from "@point_of_sale/../tests/pos/tours/utils/product_screen_util";
import { inTab } from "@point_of_sale/../tests/generic_helpers/multi_tab";

registry.category("web_tour.tours").add("test_pos_customer_display_multi_tab", {
    steps: () =>
        [
            inTab("pos", [Chrome.startPoS(), Dialog.confirm("Open Register")]),
            inTab("customer_display", { trigger: ".o_customer_display, .login-overlay" }),
            inTab("pos", [
                {
                    content: "Wait for the terminal to receive the display's registration",
                    trigger: ".product-screen",
                    async run() {
                        const pos = this.anchor.ownerDocument.defaultView.posmodel;
                        await waitUntil(() => pos.customerDisplay.hasConnectedDisplay);
                    },
                },
                ProductScreen.clickDisplayedProduct("Whiteboard Pen"),
            ]),
            inTab("customer_display", {
                content: "The display receives the terminal's order through the server",
                trigger: ".orderline:contains('Whiteboard Pen') .qty:contains('1')",
            }),
            inTab("pos", ProductScreen.clickDisplayedProduct("Whiteboard Pen")),
            inTab("customer_display", {
                content:
                    "The display receives the updated quantity while both interfaces stay open",
                trigger: ".orderline:contains('Whiteboard Pen') .qty:contains('2')",
            }),
        ].flat(),
});
