/** @odoo-module **/

import { registry } from "@web/core/registry";

const { Component } = owl;

class IntegerField extends Component {
    onChange(ev) {
        if (this.props.mode !== "write") {
            return;
        }
        this.trigger("field-changed", parseInt(ev.target.value, 10));
    }
}
IntegerField.template = "web.IntegerField";

registry.category("fields").add("integer", IntegerField);
