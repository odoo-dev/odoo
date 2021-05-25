/** @odoo-module **/

import { registry } from "@web/core/registry";

const { Component } = owl;

class CharField extends Component {
    onChange(ev) {
        if (this.props.mode !== "write") {
            return;
        }
        this.trigger("field-changed", ev.target.value);
    }
}
CharField.template = "web.CharField";

registry.category("fields").add("char", CharField);
