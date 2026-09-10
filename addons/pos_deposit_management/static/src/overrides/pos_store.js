import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/services/pos_store";

patch(PosStore.prototype, {
    _updateDepositLine(line) {
        const depositProduct = line.order_id.config.deposit_product_id;
        const depositPrice = line.product_id.product_tmpl_id.deposit_price;
        if (line.deposit_parent_line_id || line.product_id.id === depositProduct?.id) {
            return;
        }
        if (depositPrice > 0 && depositProduct) {
            if (!line.deposit_line_id) {
                const depositLine = this.data.models["pos.order.line"].create({
                    product_id: depositProduct,
                    order_id: line.order_id,
                    qty: line.getQuantity(),
                    price_unit: depositPrice,
                    price_type: "manual",
                    tax_ids: line.tax_ids.map((tax) => ["link", tax]),
                    deposit_parent_line_id: line,
                });
                line.deposit_line_id = depositLine;
            } else {
                line.deposit_line_id.setQuantity(line.getQuantity(), true);
                line.deposit_line_id.setUnitPrice(depositPrice);
            }
        } else if (line.deposit_line_id) {
            line.deposit_line_id.delete();
            line.deposit_line_id = false;
        }
        for (const comboLine of line.combo_line_ids || []) {
            this._updateDepositLine(comboLine);
        }
    },

    async addLineToOrder(vals, order, opts = {}, configure = true) {
        const line = await super.addLineToOrder(...arguments);
        if (line && this.config.module_pos_deposit_management) {
            this._updateDepositLine(line);
        }
        return line;
    },
});
