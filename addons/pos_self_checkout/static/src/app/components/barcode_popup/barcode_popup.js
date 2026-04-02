import { Component, useState } from "@odoo/owl";
import { useSelf } from "@pos_self/app/services/self_service";

export class BarcodePopup extends Component {
    static template = "pos_self_checkout.BarcodePopup";
    static props = {
        text: String,
        confirm: Function,
        close: Function,
        iconClass: { type: String, optional: true },
        warningLevel: { type: String, optional: true },
    };
    static defaultProps = {
        iconClass: "fa-user",
        warningLevel: "info",
    };

    setup() {
        this.selfOrder = useSelf();
        this.state = useState({
            code: "",
        });
    }

    confirm() {
        this.props.confirm(this.state.code);
        this.props.close();
    }
}
