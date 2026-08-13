import { patch } from "@web/core/utils/patch";
import { PosOrderline } from "@point_of_sale/app/models/pos_order_line";

patch(PosOrderline.prototype, {
    setup(vals) {
        super.setup(...arguments)
        if(!this.product_id) {
            return
        }
    },

    isRebuLine() {
        return this.tax_ids?.some((tax) => tax.l10n_es_is_rebu_tax)
    },

    computeRebuPurchasePrice() {
        if (this.pack_lot_ids.length) {
            this.total_cost = this.pack_lot_ids.reduce((sum, pl) => sum + (pl.standard_price || 0), 0);
            this.purchase_price = this.total_cost / this.pack_lot_ids.length;
        } else {
            this.purchase_price = this.product_id.standard_price;
            this.total_cost = 0.0;
        }
    },

    setPackLotLines({modifiedPackLotLines, newPackLotLines, setQuantity = true}) {
        const lotLinesToRemove = [];

        for (const lotLine of this.pack_lot_ids) {
            const modifiedLotName = modifiedPackLotLines[lotLine.id];
            if (modifiedLotName) {
                lotLine.lot_name
            } else {
                lotLinesToRemove.push(lotLine)
            }
        }

        for (const lotLine of lotLinesToRemove) {
            lotLine.delete();
        }

        for (const newLotLine of newPackLotLines) {
            this.models["pos.pack.operation.lot"].create({
                lot_name: newLotLine.lot_name,
                standard_price: newLotLine.standard_price ?? 0,
                pos_order_line_id: this,
            });
        }

        if(!this.product_id.to_weight && setQuantity) {
            this.setQuantityByLot();
        }
    }
})
