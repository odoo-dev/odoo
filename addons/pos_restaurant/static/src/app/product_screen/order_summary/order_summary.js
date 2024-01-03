/** @odoo-module */

import { patch } from "@web/core/utils/patch";
import { OrderSummary } from "@point_of_sale/app/screens/product_screen/order_summary/order_summary";

patch(OrderSummary.prototype, {
    releaseTable() {
        const orderOnTable = this.pos.models["pos.order"].filter(
            (o) => o.table_id?.id === this.pos.selectedTable.id && o.finalized === false
        );

        for (const order of orderOnTable) {
            this.pos.removeOrder(order);
        }

        this.pos.showScreen("FloorScreen");
    },
    bookTable() {
        this.pos.get_order().setBooked(true);
    },
    showBookButton() {
        return (
            this.pos.config.module_pos_restaurant &&
            this.pos.selectedTable &&
            !this.pos.models["pos.order"].some(
                (o) =>
                    o.table_id === this.pos.selectedTable.id && o.finalized === false && o.isBooked
            )
        );
    },
    tableHasOrder() {
        return this.pos.tableHasOrders(this.pos.selectedTable);
    },
});
