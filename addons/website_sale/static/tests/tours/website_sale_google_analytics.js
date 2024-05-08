/** @odoo-module **/

import { registry } from "@web/core/registry";
import * as tourUtils from "@website_sale/js/tours/tour_utils";

odoo.loader.bus.addEventListener("module-started", (e) => {
    if (e.detail.moduleName === "@website_sale/js/website_sale_tracking") {
        //import websiteSaleTracking from "@website_sale/js/website_sale_tracking";
        e.detail.module[Symbol.for("default")].include({
            // Purposely don't call super to avoid call to third party (GA) during tests
            _onViewItem(event) {
                const data = event.detail;
                document.body.setAttribute("view-event-id", data.item_id);
            },
            _onAddToCart(event) {
                const data = event.detail;
                document.body.setAttribute("cart-event-id", data.item_id);
            },
        });
    }
});

let itemId;


registry.category("web_tour.tours").add('google_analytics_view_item', {
    test: true,
    url: '/shop?search=Customizable Desk',
    steps: () => [
    {
        content: "select customizable desk",
        trigger: '.oe_product_cart a:contains("Customizable Desk")',
        run: "click",
    },
    {
        content: "wait until `_getCombinationInfo()` rpc is done",
        trigger: 'body[view-event-id]',
        timeout: 25000,
        run: () => {
            itemId = document.body.getAttribute("view-event-id");
            document.body.removeAttribute("view-event-id");
        }
    },
    {
        trigger: 'body:not([view-event-id])',
    },
    {
        content: 'select another variant',
        trigger: 'ul.js_add_cart_variants ul.list-inline li:has(label.active) + li:has(label) input',
        run: "click",
    },
    {
        content: 'wait until `_getCombinationInfo()` rpc is done (2)',
        // a new view event should have been generated, for another variant
        trigger: `body[view-event-id]:not([view-event-id="${itemId}"])`,
        timeout: 25000,
    },
]});

registry.category("web_tour.tours").add('google_analytics_add_to_cart', {
    test: true,
    url: '/shop?search=Acoustic Bloc Screens',
    steps: () => [
    ...tourUtils.addToCart({productName: 'Acoustic Bloc Screens', search: false}),
    {
        trigger: "body[cart-event-id]",
    },
    {
        content: 'check add to cart event',
        trigger: "a:has(.my_cart_quantity:contains(/^1$/))",
        timeout: 25000,
    },
]});
