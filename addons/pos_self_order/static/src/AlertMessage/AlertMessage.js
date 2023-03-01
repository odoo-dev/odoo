/** @odoo-module */

const { Component } = owl;
import { _t } from "@web/core/l10n/translation";
const alert_index = {
    restaurant_is_closed: {
        class: "alert alert-danger",
        title: "The restaurant is closed",
        message: "You can still view the menu, but you will not be able to order.",
    },
};
export class AlertMessage extends Component {
    setup() {
        const alert_type = this.props.alert_type;
        this.alert =
            alert_type in alert_index
                ? alert_index[alert_type]
                : { class: "alert alert-primary", message: alert_type };
    }
}
AlertMessage.template = "AlertMessage";
export default { AlertMessage };
