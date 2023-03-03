/** @odoo-module */

const { Component, useState } = owl;
import { LandingPageHeader } from "../LandingPageHeader/LandingPageHeader.js";
import { LandingPageFooter } from "../LandingPageFooter/LandingPageFooter.js";
import { useSelfOrder } from "@pos_self_order/SelfOrderService";
import { formatMonetary } from "@web/views/fields/formatters";
export class LandingPage extends Component {
    static template = "LandingPage";
    static components = {
        LandingPageHeader,
        LandingPageFooter,
    };
    setup() {
        this.state = useState(this.env.state);
        this.selfOrder = useSelfOrder();
        this.formatMonetary = formatMonetary;
    }
}
export default { LandingPage };
