import { registry } from "@web/core/registry";
import { SaleOrderCards } from "./sale_order_cards"

const SaleOrderCardsEdit = I => class extends I {
    start() {
        super.start();
        this.loadMoreButton.setAttribute("disabled", "true");
    }
};

registry
    .category("public.interactions.edit")
    .add("website_dynamic_snippet.s_sale_order_cards", { Interaction: SaleOrderCards, mixin: SaleOrderCardsEdit });
