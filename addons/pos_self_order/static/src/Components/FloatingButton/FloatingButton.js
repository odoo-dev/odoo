/** @odoo-module */

import { useSelfOrder } from "@pos_self_order/SelfOrderService";

const { Component } = owl;

export class FloatingButton extends Component {
    static template = "pos_self_order.FloatingButton";
    setup() {
        this.selfOrder = useSelfOrder();
    }
}
