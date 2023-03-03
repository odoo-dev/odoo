/** @odoo-module */

import { useSelfOrder } from "@pos_self_order/SelfOrderService";

const { Component } = owl;

export class NavBar extends Component {
    static template = "NavBar";
    setup() {
        this.selfOrder = useSelfOrder();
    }
}
export default { NavBar };
