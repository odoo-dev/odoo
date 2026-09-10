import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/services/pos_store";

patch(PosStore.prototype, {
    _updateDepositLine(mainLine) {
        const order = mainLine.order_id;
        const depositProduct = order.config.deposit_product_id;
        const depositPrice = mainLine.product_id?.product_tmpl_id?.deposit_price;

        if (mainLine.deposit_parent_line_id || mainLine.product_id.id === depositProduct.id) {
            return mainLine;
        }

        if (depositPrice <= 0 || !depositProduct) {
            if (mainLine.deposit_line_id) {
                mainLine.deposit_line_id.delete();
                mainLine.deposit_line_id = false;
            }
        } else if (!mainLine.deposit_line_id) {
            const taxIds = mainLine.tax_ids.map((tax) => ["link", tax]);
            const depositLine = this.data.models["pos.order.line"].create({
                product_id: depositProduct,
                order_id: order,
                qty: mainLine.getQuantity(),
                price_unit: depositPrice,
                price_type: "manual",
                tax_ids: taxIds,
                deposit_parent_line_id: mainLine,
            });
            mainLine.deposit_line_id = depositLine;
        } else {
            mainLine.deposit_line_id.setQuantity(mainLine.getQuantity(), true);
            mainLine.deposit_line_id.setUnitPrice(depositPrice);
        }

        for (const comboLine of mainLine.combo_line_ids || []) {
            this._updateDepositLine(comboLine);
        }
        return mainLine;
    },

    async addLineToOrder(vals, order, opts = {}, configure = true) {
        const line = await super.addLineToOrder(...arguments);
        if (line && this.config.module_pos_deposit_management && !line.deposit_parent_line_id) {
            this._updateDepositLine(line);
        }
        return line;
    },

    _reapOrphanDepositLines(order) {
        const depositProductId = order.config.deposit_product_id?.id;
        if (!depositProductId) {
            return;
        }
        for (const line of [...order.getOrderlines()]) {
            const parent = line.deposit_parent_line_id;
            if (
                line.product_id?.id === depositProductId &&
                line.uiState?.isDepositLine &&
                (!parent || !parent.order_id || parent.order_id !== order)
            ) {
                line.delete();
            }
        }
    },

    tryMergeOrderline(order, line, merge, selectedOrderline) {
        if (line.deposit_parent_line_id) {
            return super.tryMergeOrderline(order, line, false, selectedOrderline);
        }
        const result = super.tryMergeOrderline(order, line, merge, selectedOrderline);
        this._reapOrphanDepositLines(order);
        return result;
    },
});
