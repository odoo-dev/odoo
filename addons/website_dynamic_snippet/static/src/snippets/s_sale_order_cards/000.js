/** @odoo-module */
import { renderToFragment } from "@web/core/utils/render";
import publicWidget from "@web/legacy/js/public/public_widget";

publicWidget.registry.s_sale_order_cards = publicWidget.Widget.extend({
    selector: ".s_sale_order_cards",
    disabledInEditableMode: false,
    events: {
        "click #load_more_orders": "loadMore",
    },

    init() {
        this._super(...arguments);
        this.orm = this.bindService("orm");
        this.noOfOrders = 10;
        this.offset = 0;
        this.orders = [];
    },

    async willStart() {
        await this.fetchOrders();
    },

    start() {
        this.renderOrders();
    },

    renderOrders() {
        const target = this.el.querySelector("#sale_order_cards_container");
        const displayType = this.el.dataset.displayType ?? "card";
        if (this.orders.length) {
            const cards = renderToFragment(
                `website_dynamic_snippet.s_sale_order_cards.${displayType}`,
                { orders: this.orders }
            );
            target.innerHTML = "";
            target.appendChild(cards);
        }
    },

    async fetchOrders() {
        this.showConfirmOrders = this.el.dataset.showConfirmOrders === "true" ?? false;
        this.noOfOrders = parseInt(this.el.dataset.noOfOrders) || 10;
        const domain = this.showConfirmOrders ? [["state", "=", "sale"]] : [];
        const temp_orders = await this.orm.searchRead(
            "sale.order",
            domain,
            ["name", "partner_id", "state"],
            { limit: this.noOfOrders, offset: this.offset }
        );
        if (temp_orders.length === 0) {
            const loadMoreButton = this.el.querySelector("#load_more_orders");
            loadMoreButton.classList.add("d-none");
        }
        this.orders.push(...temp_orders);
    },

    async loadMore() {
        this.offset += this.noOfOrders;
        await this.fetchOrders();
        this.renderOrders();
    },
});
