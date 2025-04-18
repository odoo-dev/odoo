import { Component, onWillStart, xml } from "@odoo/owl";

export class Img extends Component {
    static props = {
        src: String,
        attrs: { type: Object, optional: true },
    };
    static template = xml`<img t-att-src="props.src" t-att="props.attrs"/>`;
    setup() {
        onWillStart(
            () =>
                new Promise((resolve, reject) => {
                    const img = new Image();
                    img.onload = () => resolve({ status: "loaded" });
                    img.onerror = () => resolve({ status: "error" });
                    img.src = this.props.src;
                })
        );
    }
}
