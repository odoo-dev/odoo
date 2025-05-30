import { registry } from "@web/core/registry";
import { SaleOrderCards } from "./sale_order_cards"

const SaleOrderCardsPreview = I => class extends I {
    dynamicContent = {
        _root: {
            "t-on-mouseenter": () => {
                this.el.style.backgroundColor = "#f0f0f0"
            },
            "t-on-mouseleave": () => {
                this.el.style.backgroundColor = "";
            },
        },
    };
};

registry
    .category("public.interactions.preview")
    .add("website_dynamic_snippet.s_sale_order_cards", { Interaction: SaleOrderCards, mixin: SaleOrderCardsPreview });
