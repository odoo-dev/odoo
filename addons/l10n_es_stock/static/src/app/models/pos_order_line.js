import { patch } from "@web/core/utils/patch";
import { PosOrderline } from "@point_of_sale/app/models/pos_order_line";

patch(PosOrderline.prototype, {
    setup(vals) {
        super.setup(...arguments)
        if(!this.product_id) {
            return
        }
        this.computeRebuPurchasePrice();
    },

    isRebuLine() {
        return this.tax_ids?.some((tax) => tax.l10n_es_is_rebu_tax)
    },

    computeRebuPurchasePrice() {
        const lots = this.pack_lot_ids.map((pl) => pl.lot_id).filter(Boolean);
        if (lots.length) {
            this.total_cost = lots.reduce((sum, lot) => sum + lot.l10n_es_rebu_purchase_price, 0);
            this.purchase_price = this.total_cost / lots.length;
        } else {
            this.purchase_price = this.product_id.standard_price;
            this.total_cost = 0.0;
        }
    },
})

