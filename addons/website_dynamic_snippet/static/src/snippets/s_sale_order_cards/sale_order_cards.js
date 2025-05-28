import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";

export class SaleOrderCards extends Interaction {
    static selector = ".s_sale_order_cards";
    dynamicContent = {
        "#load_more_orders": {
            "t-on-click": this.loadMore,
        },
    };

    setup() {
        this.noOfOrders = 10;
        this.offset = 0;
        this.orders = [];
    }

    async willStart() {
        await this.fetchOrders();
    }

    start() {
        this.loadMoreButton = this.el.querySelector("#load_more_orders")
        this.loadMoreButton.removeAttribute("disabled");
        this.renderOrders();
    }

    renderOrders() {
        const target = this.el.querySelector("#sale_order_cards_container");
        const displayType = this.el.dataset.displayType ?? "card";
        const templateName = `website_dynamic_snippet.s_sale_order_cards.${displayType}`;
        if (this.orders.length) {
            this.renderAt(templateName, { orders: this.orders }, target, "afterbegin");
        }
    }

    async fetchOrders() {
        this.showConfirmOrders = this.el.dataset.showConfirmOrders === "true" ?? false;
        this.noOfOrders = parseInt(this.el.dataset.noOfOrders);
        const domain = this.showConfirmOrders ? [["state", "=", "sale"]] : [];
        const temp_orders = await this.services.orm.searchRead(
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
    }

    async loadMore() {
        this.offset += this.noOfOrders;
        await this.fetchOrders();
        this.renderOrders();
    }
}

registry
    .category("public.interactions")
    .add("website_dynamic_snippet.s_sale_order_cards", SaleOrderCards);
