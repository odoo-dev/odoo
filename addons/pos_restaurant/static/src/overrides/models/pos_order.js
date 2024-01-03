/** @odoo-module */

import { PosOrder } from "@point_of_sale/app/models/pos_order";
import { patch } from "@web/core/utils/patch";

// FIXME still use of pos
patch(PosOrder.prototype, {
    setup(_defaultObj, options) {
        super.setup(...arguments);
        if (this.config.module_pos_restaurant) {
            // FIXME
            // if (this.defaultTableNeeded(options)) {
            //     this.tableId = this.pos.selectedTable.id;
            // }
            this.customerCount = this.customerCount || 1;
        }
    },
    getCustomerCount() {
        return this.customerCount;
    },
    setCustomerCount(count) {
        this.customerCount = Math.max(count, 0);
    },
    getTable() {
        if (this.config.module_pos_restaurant) {
            return this.models["restaurant.table"].get(this.tableId);
        }
        return null;
    },
    defaultTableNeeded(options) {
        return !this.tableId && !options.json && this.pos.selectedTable;
    },
    export_for_printing() {
        return {
            ...super.export_for_printing(...arguments),
            set_tip_after_payment: this.config.set_tip_after_payment,
            isRestaurant: this.config.module_pos_restaurant,
        };
    },
    setBooked(booked) {
        this.uiState.booked = booked;
    },
});
