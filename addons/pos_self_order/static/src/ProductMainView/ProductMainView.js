/** @odoo-module */

import { Component, useState } from "@odoo/owl";
import { useSelfOrder } from "@pos_self_order/SelfOrderService";
import { formatMonetary } from "@web/views/fields/formatters";
import { NavBar } from "@pos_self_order/NavBar/NavBar";
export class ProductMainView extends Component {
    static template = "ProductMainView";
    static components = {
        NavBar,
    };
    setup() {
        this.state = useState(this.env.state);
        this.state.currentProduct = this.props.product.product_id;
        this.selfOrder = useSelfOrder();
        this.formatMonetary = formatMonetary;
    }
}

export default { ProductMainView };
