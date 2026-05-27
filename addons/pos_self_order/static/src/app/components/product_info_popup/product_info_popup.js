import { useExternalListener, useState } from "@web/owl2/utils";
import { Component, signal } from "@odoo/owl";
import { useScrollShadow } from "../../utils/scroll_shadow_hook";
export class ProductInfoPopup extends Component {
    static template = "pos_self_order.ProductInfoPopup";
    static props = {
        productTemplate: Object,
        close: Function,
    };

    scrollContainerRef = signal(null);

    setup() {
        this.scrollShadow = useScrollShadow(this.scrollContainerRef);
        useExternalListener(window, "click", this.props.close);
        this.state = useState({
            qty: 1,
        });
    }
}
