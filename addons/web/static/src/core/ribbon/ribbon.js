import { Component } from "@odoo/owl";

export class Ribbon extends Component {
    static template = "web.Ribbon";
    static props = {
        text: { type: String },
        title: { type: String, optional: true },
        bgClass: { type: String, optional: true },
    };
    static defaultProps = {
        title: "",
        bgClass: "text-bg-success",
    };

    get classes() {
        let classes = this.props.bgClass;
        if (this.props.text.length > 15) {
            classes += " o_small";
        } else if (this.props.text.length > 10) {
            classes += " o_medium";
        }
        return classes;
    }
}
