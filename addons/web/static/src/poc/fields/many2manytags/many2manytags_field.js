/** @odoo-module **/

import { registry } from "@web/core/registry";
import { useFieldModel } from "../field_model_hook";

const { Component } = owl;

class Many2ManyTagsField extends Component {
    setup() {
        this.model = useFieldModel();
    }

    get dataPoint() {
        return this.model.findDataPoint(this.props.value);
    }

    onChange(ev) {
        if (this.props.mode !== "write") {
            return;
        }
        this.trigger("field-changed", ev.target.value);
    }
}
Many2ManyTagsField.template = "web.Many2ManyTagsField";
Many2ManyTagsField.dependencies = {
    display_name: { type: "char" },
};

registry.category("fields").add("many2many_tags", Many2ManyTagsField);
