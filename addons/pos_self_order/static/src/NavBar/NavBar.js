/** @odoo-module */

import { Component } from "@odoo/owl";
import { useSelfOrder } from "@pos_self_order/SelfOrderService";
export class NavBar extends Component {
    static template = "NavBar";
    setup() {
        this.selfOrder = useSelfOrder();
    }
}
export default { NavBar };
