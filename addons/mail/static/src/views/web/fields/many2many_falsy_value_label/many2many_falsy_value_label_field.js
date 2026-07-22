import { Component, props } from "@odoo/owl";

import { registry } from "@web/core/registry";
import {
    many2ManyTagsField,
    X2ManyTagsField,
    x2ManyTagsFieldProps,
} from "@web/views/fields/many2many_tags/many2many_tags_field";

export class Many2ManyFalsyValueLabelField extends Component {
    static template = "mail.Many2ManyFalsyValueLabelField";
    static components = { X2ManyTagsField };
    props = props({
        ...x2ManyTagsFieldProps,
    });

    get m2mProps() {
        return {
            ...this.props,
            placeholder: this.falsyValueLabel,
        };
    }

    get falsyValueLabel() {
        return this.props.record.fields[this.props.name].falsy_value_label;
    }
}

registry.category("fields").add("many2many_falsy_value_label", {
    ...many2ManyTagsField,
    component: Many2ManyFalsyValueLabelField,
});
