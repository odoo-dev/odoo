import { Component } from "@odoo/owl";
import { hasTouch } from "@web/core/browser/feature_detection";

export class InternalLinkButton extends Component {
    static components = {};
    static template = "web.InternalLinkButton";
    static props = {
        onClick: { type: Function },
    };
    setup() {
        this.hasTouch = hasTouch();
    }
}
