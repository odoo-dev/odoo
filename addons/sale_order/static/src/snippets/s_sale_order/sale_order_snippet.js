import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";

export class SaleOrderSnippet extends Interaction {
    static selector = ".s_sale_order_items";
    dynamicContent = {
        "#load_more_btn": {
            "t-on-click": this.onLoadMore,
        },
    };

    setup() {
        this.limit = 10;
        this.offset = 0;
        this.orders = [];
    }

    async willStart() {
        await this.fetchOrders();
    }

    start() {
        this.renderOrders();
    }

    async fetchOrders() {
        const showConfirmed = this.el.dataset.confirmOrders === "true";
        const domain = showConfirmed ? [["state", "=", "sale"]] : [];
        const newOrders = await this.waitFor(
            this.services.orm.searchRead(
                "sale.order",
                domain,
                ["id", "name", "partner_id", "state"],
                { offset: this.offset, limit: this.limit }
            )
        );
        this.orders = this.orders.concat(newOrders);
        this.offset += this.limit;
    }

    renderOrders() {
        const viewTemplate = this.el.dataset.layout || "card";
        const tmpl =
            viewTemplate === "list" ? "sale_order.sale_order_list" : "sale_order.sale_order_card";

        const elements = this.renderAt(tmpl, { saleOrders: this.orders }, this.el);
        this.el.replaceChildren(...elements);
    }

    async onLoadMore() {
        await this.fetchOrders();
        this.renderOrders();
    }
}

registry.category("public.interactions").add("sale_order.sale_order_snippet", SaleOrderSnippet);

registry
    .category("public.interactions.edit")
    .add("sale_order.sale_order_snippet", { Interaction: SaleOrderSnippet });
