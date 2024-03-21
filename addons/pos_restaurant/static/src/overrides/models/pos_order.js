/* eslint { "no-restricted-syntax": [ "error", {
    "selector": "MemberExpression[object.type=ThisExpression][property.name=pos]",
    "message": "Using this.pos in models is deprecated and about to be removed, for any question ask PoS team." }]}*/

import { PosOrder } from "@point_of_sale/app/models/pos_order";
import { patch } from "@web/core/utils/patch";

patch(PosOrder.prototype, {
    setup(_defaultObj, options) {
        super.setup(...arguments);
        if (this.config.module_pos_restaurant) {
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
            return this.table_id;
        }
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
