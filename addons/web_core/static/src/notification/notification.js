import { Component, props } from "@odoo/owl";

export class Notification extends Component {
    static template = "web_core.Notification";

    props = props({
        buttons: {
            type: Array,
        },
        id: Number,
        duration: Number,
        message: String,
        close: Function,
        title: { type: String, optional: true },
        type: String,
    });

    setup() {
        if (Number.isFinite(this.props.duration)) {
            setTimeout(() => {
                this.props.close();
            }, this.props.duration);
        }
    }
}
