/** @odoo-module **/

import { registry } from "@web/core/registry";
import { standardFieldProps } from "./standard_field_props";

const { Component } = owl;

export class TextField extends Component {
    onChange(ev) {
        this.props.record.update(this.props.name, ev.target.value);
    }
}

TextField.props = {
    ...standardFieldProps,
    placeholder: { type: String, optional: true },
};
TextField.template = "web.TextField";

registry.category("fields").add("text", TextField);
registry.category("fields").add("html", TextField);
