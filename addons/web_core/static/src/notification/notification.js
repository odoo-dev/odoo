import { Component, props } from "@odoo/owl";

export class Notification extends Component {
    static template = "web_core.Notification";

    props = props({
        buttons: {
            type: Array,
        },
        id: Number,
        lifespan: Number,
        message: String,
        pop: Function,
        title: { type: String, optional: true },
        type: String,
    });

    setup() {
        setTimeout(() => {
            this.props.pop();
        }, this.props.lifespan);
    }
}
