/** @odoo-module */

import { Component, useState } from "@odoo/owl";
import { LandingPageHeader } from "@pos_self_order/LandingPageComponents/LandingPageHeader/LandingPageHeader";
import { LandingPageFooter } from "@pos_self_order/LandingPageComponents/LandingPageFooter/LandingPageFooter";
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
