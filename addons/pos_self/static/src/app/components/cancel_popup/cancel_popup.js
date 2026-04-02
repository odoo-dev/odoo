import { Component } from "@odoo/owl";
import { useSelf } from "@pos_self/app/services/self_service";

export class CancelPopup extends Component {
    static template = "pos_self.CancelPopup";
    static props = {
        title: String,
        confirm: Function,
        close: Function,
    };

    setup() {
        this.selfOrder = useSelf();
    }

    confirm() {
        this.props.close();
        this.props.confirm();
    }
}
