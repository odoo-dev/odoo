import { patch } from "@web/core/utils/patch";
import { OrderSummary } from "@point_of_sale/app/screens/product_screen/order_summary/order_summary";

patch(OrderSummary.prototype, {
    _getRemovedQty(line, key) {
        if (key === "Backspace") {
            return line.qty;
        }
        return line.qty - parseFloat(key || 0);
    },
    _captureOldValues(lines) {
        const map = {};
        for (const line of lines) {
            map[line.uuid] = {
                priceExcl: line.priceExcl,
                priceIncl: line.priceIncl,
            };
        }
        return map;
    },
    _updateHistoryLines(lines, oldValues, removedQty) {
        for (const line of lines) {
            const old = oldValues[line.uuid];

            const removedSubtotal = old.priceExcl - line.priceExcl;
            const removedSubtotalIncl = old.priceIncl - line.priceIncl;

            let historyLine = this.pos.models["pos.history.line"].find(
                (l) => l.pos_line_uuid === line.uuid
            );

            if (!historyLine) {
                historyLine = this.createHistoryLine(line, removedQty);
            } else {
                historyLine.qty += removedQty;
            }

            historyLine.price_subtotal = (historyLine.price_subtotal || 0) + removedSubtotal;
            historyLine.price_subtotal_incl =
                (historyLine.price_subtotal_incl || 0) + removedSubtotalIncl;
        }
    },
    async updateSelectedOrderline({ buffer, key }) {
        const order = this.pos.getOrder();
        const selectedLine = order.getSelectedOrderline();

        if (
            !this.pos.config.is_history_tracked ||
            (this.pos.numpadMode !== "quantity" && key !== "Backspace")
        ) {
            return await super.updateSelectedOrderline({ buffer, key });
        }

        // Calculate removed quantity
        const removedQty = this._getRemovedQty(selectedLine, key);
        if (removedQty <= 0) {
            return await super.updateSelectedOrderline({ buffer, key });
        }
        // Get all related lines
        const affectedLines = selectedLine.getAllLinesInCombo();
        // Store old subtotals BEFORE update
        const oldValues = this._captureOldValues(affectedLines);
        const result = await super.updateSelectedOrderline({ buffer, key });
        // Apply history updates based on diff
        this._updateHistoryLines(affectedLines, oldValues, removedQty);

        return result;
    },
    createHistoryLine(orderlineToRemove, removedQty) {
        return this.pos.data.models["pos.history.line"].create({
            product_id: orderlineToRemove.product_id,
            qty: removedQty,
            price_unit: orderlineToRemove.price_unit,
            pos_line_uuid: orderlineToRemove.uuid,
            combo_item_id: orderlineToRemove.combo_item_id,
            combo_parent_id: orderlineToRemove.combo_parent_id,
            combo_line_ids: orderlineToRemove.combo_line_ids,
            price_extra: orderlineToRemove.price_extra,
            attribute_value_ids: orderlineToRemove.attribute_value_ids,
            custom_attribute_value_ids: orderlineToRemove.custom_attribute_value_ids,
            discount: orderlineToRemove.discount,
            tax_ids: orderlineToRemove.tax_ids,
            order_id: orderlineToRemove.order_id,
        });
    },
});
