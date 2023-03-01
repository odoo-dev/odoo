/** @odoo-module */

const { Component, useState } = owl;
import { LandingPageHeader } from "../LandingPageHeader/LandingPageHeader.js";
import { LandingPageFooter } from "../LandingPageFooter/LandingPageFooter.js";
import { AlertMessage } from "../../AlertMessage/AlertMessage.js";
import { useSelfOrder } from "@pos_self_order/SelfOrderService";
import { formatMonetary } from "@web/views/fields/formatters";
export class LandingPage extends Component {
    setup() {
        this.state = useState(this.env.state);
        this.selfOrder = useSelfOrder();
        this.formatMonetary = formatMonetary;
    }

    static components = {
        LandingPageHeader,
        LandingPageFooter,
        AlertMessage,
    };
}
LandingPage.template = "LandingPage";
export default { LandingPage };
