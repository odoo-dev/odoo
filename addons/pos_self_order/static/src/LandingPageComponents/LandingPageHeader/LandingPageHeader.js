/** @odoo-module */

const { Component } = owl;
import { useSelfOrder } from "@pos_self_order/SelfOrderService";

export class LandingPageHeader extends Component {
    static template = "LandingPageHeader";
    setup() {
        this.selfOrder = useSelfOrder();
    }
}
export default { LandingPageHeader };
