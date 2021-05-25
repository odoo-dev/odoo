/** @odoo-module **/

import { registry } from "@web/core/registry";

const { Component } = owl;

class Many2OneField extends Component {
    onChange(ev) {
        if (this.props.mode !== "write") {
            return;
        }
        this.trigger("field-changed", ev.target.value);
    }
}
Many2OneField.template = "web.Many2OneField";

registry.category("fields").add("many2one", Many2OneField);
