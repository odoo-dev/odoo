/** @odoo-module */
import { AbstractAwaitablePopup } from "@point_of_sale/app/popup/abstract_awaitable_popup";
import { useState } from "@odoo/owl";
import { usePos } from "../pos_hook";
import { ProductCard } from "@point_of_sale/app/generic_components/product_card/product_card";
import { floatIsZero } from "@web/core/utils/numbers";

export class ComboConfiguratorPopup extends AbstractAwaitablePopup {
    static template = "point_of_sale.ComboConfiguratorPopup";
    static components = { ProductCard };

    setup() {
        super.setup();
        this.pos = usePos();
        this.state = useState({
            combo: Object.fromEntries(this.props.product.combo_ids.map((elem) => [elem, 0])),
        });
    }

    areAllCombosSelected() {
        return Object.values(this.state.combo).every((x) => Boolean(x));
    }

    formattedComboPrice(comboLine) {
        const combo_price = comboLine.combo_price;
        if (floatIsZero(combo_price)) {
            return "";
        } else {
            const product = this.pos.db.product_by_id[comboLine.product_id.id];
            return this.env.utils.formatCurrency(product.get_display_price({ price: combo_price }));
        }
    }

    /**
     * @returns {Object}
     */
    getPayload() {
        return Object.values(this.state.combo)
            .filter((x) => x) // we only keep the non-zero values
            .map((x) => this.pos.indexed["pos.combo.line"].id[x]);
    }
}
