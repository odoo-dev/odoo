import { Component, onWillDestroy, useProps, proxy, t } from "@odoo/owl";
import { OrderDisplay } from "@point_of_sale/app/components/order_display/order_display";
import { Orderline } from "@point_of_sale/app/components/orderline/orderline";
import { PriceFormatter } from "@point_of_sale/app/components/price_formatter/price_formatter";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import { useRouterParamsChecker } from "@point_of_sale/app/hooks/pos_router_hook";
import { localeCompare } from "@web/core/l10n/utils";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

export class SplitBillScreen extends Component {
    static template = "point_of_sale.SplitBillScreen";
    static components = { Orderline, OrderDisplay, PriceFormatter };

    props = useProps({
        orderUuid: t.string(),
    });

    setup() {
        this.pos = usePos();
        this.ui = useService("ui");
        this.qtyTracker = proxy({});
        this.priceTracker = proxy({});

        useRouterParamsChecker(this.constructor.name);

        onWillDestroy(() => {
            // Removing on all lines because the current order change during the split
            this.pos.models["pos.order.line"].map((l) => (l.uiState.splitQty = false));
        });
    }

    get currentOrder() {
        return this.pos.getOrder();
    }

    get newOrderPrice() {
        return Object.values(this.priceTracker).reduce((a, b) => a + b, 0);
    }

    getNumberOfProducts() {
        return Object.values(this.qtyTracker).reduce((a, b) => a + b, 0);
    }

    onClickLine(line) {
        const lines = line.getAllLinesInCombo();
        const comboRootLine = lines[0];
        const rootQty = comboRootLine.getQuantity();

        for (const line of lines) {
            const maxQty = line.getQuantity();
            const uuid = line.uuid;
            const currentQty = this.qtyTracker[uuid] || 0;

            if (!line.isPosGroupable() && !line.isPartOfCombo()) {
                this.qtyTracker[uuid] = currentQty === maxQty ? 0 : maxQty;
            } else {
                const selectedQty =
                    line.combo_parent_id && rootQty ? line.getQuantity() / rootQty : 1;

                const nextQty =
                    currentQty === maxQty ? 0 : Math.min(currentQty + selectedQty, maxQty);

                this.qtyTracker[uuid] = nextQty;
            }
            this.priceTracker[uuid] =
                (line.prices.total_included / line.qty) * this.qtyTracker[uuid];
            this.setLineQtyStr(line);
        }
    }

    _getOrderName(order) {
        return order.table_id?.table_number.toString() || order.floatingOrderName || "";
    }

    _getLatestOrderNameStartingWith(name) {
        return (
            this.pos
                .getOpenOrders()
                .map((order) => this._getOrderName(order))
                .filter((orderName) => orderName.slice(0, -1) === name)
                .sort((a, b) => localeCompare(a.slice(-1), b.slice(-1)))
                .at(-1) || name
        );
    }

    _getSplitOrderName(originalOrderName) {
        const latestOrderName = this._getLatestOrderNameStartingWith(originalOrderName);
        if (latestOrderName === originalOrderName) {
            return `${originalOrderName}B`;
        }
        const lastChar = latestOrderName[latestOrderName.length - 1];
        if (lastChar === "Z") {
            throw new Error("You cannot split the order into more than 26 parts!");
        }
        const nextChar = String.fromCharCode(lastChar.charCodeAt(0) + 1);
        return `${latestOrderName.slice(0, -1)}${nextChar}`;
    }

    async paySplittedOrder() {
        const selectedQty = this.getNumberOfProducts();

        if (selectedQty > 0 && selectedQty < this.currentOrder.splittableQuantity) {
            const originalOrder = this.currentOrder;
            await this.createSplittedOrder();
            originalOrder.setScreenData({ name: "SplitBillScreen" });
        }
        this.pos.pay();
    }

    /**
     * Values of the order receiving the selected lines.
     */
    _prepareNewOrderValues(originalOrder) {
        return {
            partner_id: originalOrder.partner_id,
            preset_id: originalOrder.preset_id,
            preset_time: originalOrder.preset_time,
            fiscal_position_id: originalOrder.fiscal_position_id,
            to_invoice: originalOrder.to_invoice,
            general_customer_note: originalOrder.general_customer_note,
            internal_note: originalOrder.internal_note,
        };
    }

    /**
     * Values of the line created in the new order for `line`.
     * @param {Object} split `{ originalOrder, newOrder }`, shared by the whole split
     */
    _prepareSplitLineValues(line, split) {
        const data = { ...line.raw };
        // Combo lines will be relinked by the children
        delete data.combo_line_ids;
        delete data.uuid;
        delete data.id;
        delete data.prep_line_ids;
        return {
            ...data,
            qty: this.qtyTracker[line.uuid],
            order_id: split.newOrder.id,
        };
    }

    /**
     * Recompute the global discount and the service fees of the orders once the lines
     * are moved. `newOrder` is false when its pricing must be left untouched.
     */
    async _applySplitPricing(originalOrder, newOrder) {
        const { value, type } = originalOrder.globalDiscountPc;
        if (value) {
            await this.pos.applyDiscount(value, type, originalOrder);
            if (newOrder) {
                await this.pos.applyDiscount(value, type, newOrder);
            }
        }
        if (originalOrder.preset_id?.service_fee) {
            originalOrder.recomputeServiceFees();
            newOrder?.recomputeServiceFees();
        }
    }

    /**
     * Hook called once the lines are moved, before both orders are synced.
     */
    async _beforeSplitOrderSync(split) {}

    _transferPrepLines(line, newLine, split) {
        if (!split.prepOrder) {
            return;
        }
        let toTransfer = this.qtyTracker[line.uuid];
        for (const prepLine of line.prep_line_ids) {
            const preparedQty = prepLine.quantity - prepLine.cancelled;
            const transferredQty = Math.min(preparedQty, toTransfer);
            if (transferredQty > 0) {
                const newPrepLine = this.pos.models["pos.prep.line"].create({
                    prep_order_id: split.prepOrder,
                    pos_order_line_id: newLine,
                    product_id: prepLine.product_id.id,
                    quantity: transferredQty,
                    attribute_value_ids: prepLine.attribute_value_ids,
                });
                split.prepLinePairs.push([prepLine.uuid, newPrepLine.uuid]);
                prepLine.quantity -= transferredQty;
                toTransfer -= transferredQty;
            }
            if (toTransfer === 0) {
                break;
            }
        }
    }

    async createSplittedOrder() {
        const originalOrder = this.currentOrder;
        const newOrderName = this._getSplitOrderName(this._getOrderName(originalOrder));

        const newOrder = this.pos.createNewOrder(this._prepareNewOrderValues(originalOrder));
        const split = {
            originalOrder,
            newOrder,
            prepOrder: originalOrder.prep_order_ids?.length
                ? this.pos.models["pos.prep.order"].create({ pos_order_id: newOrder })
                : null,
            prepLinePairs: [],
        };
        newOrder.setPricelist(originalOrder.pricelist_id);
        newOrder.floating_order_name = newOrderName;
        newOrder.uiState.splittedOrderUuid = originalOrder.uuid;
        originalOrder.uiState.splittedOrderUuid = newOrder.uuid;

        // Create lines for the new order
        const comboMap = new Map();
        const lineToDel = [];
        for (const line of originalOrder.lines) {
            if (!this.qtyTracker[line.uuid]) {
                continue;
            }
            const newLine = this.pos.models["pos.order.line"].create(
                this._prepareSplitLineValues(line, split),
                false,
                true
            );
            newLine.setHasChange(false);

            if (line.combo_line_ids.length > 0) {
                for (const comboLine of line.combo_line_ids) {
                    comboMap.set(comboLine.uuid, newLine);
                }
            }
            if (line.combo_parent_id) {
                newLine.combo_parent_id = comboMap.get(line.uuid);
            }

            if (line.getQuantity() === this.qtyTracker[line.uuid]) {
                lineToDel.push(line);
            } else {
                line.update({ qty: line.getQuantity() - this.qtyTracker[line.uuid] });
            }
            this._transferPrepLines(line, newLine, split);
        }

        for (const line of lineToDel) {
            line.delete();
        }
        await this._applySplitPricing(originalOrder, newOrder);
        await this._beforeSplitOrderSync(split);
        await this.pos.syncAllOrders({ orders: [originalOrder, newOrder] });
        await this.pos.onPrepLinesSynced(split.prepLinePairs);
        originalOrder.setScreenData({ name: "ProductScreen" });
        this.pos.selectedOrderUuid = null;
        this.pos.setOrder(newOrder);
        this.back();
        return newOrder;
    }

    setLineQtyStr(line) {
        const splitQty = this.qtyTracker[line.uuid];
        line.uiState.splitQty = `${splitQty} / ${line.getQuantityStr().unitPart}`;
    }

    back() {
        this.pos.navigate("ProductScreen", {
            orderUuid: this.pos.selectedOrderUuid,
        });
    }

    adjustFontSize(amount) {
        const length = amount.toString().length;
        if (length > 11) {
            return "6vw";
        } else if (length > 9) {
            return "8vw";
        } else {
            return "10vw";
        }
    }
}

registry.category("pos_pages").add("SplitBillScreen", {
    name: "SplitBillScreen",
    component: SplitBillScreen,
    route: `/pos/ui/${odoo.pos_config_id}/splitting/{string:orderUuid}`,
    params: {
        orderUuid: true,
        orderFinalized: false,
    },
});
