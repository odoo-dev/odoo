import { Component } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { _t } from "@web/core/l10n/translation";
import { standardFieldProps } from "@web/views/fields/standard_field_props";

export class BooleanLabelField extends Component {
    static template = "mail.BooleanLabelField";
    static props = {
        ...standardFieldProps,
        label: { type: String },
        btnClassOn: { type: String },
        btnClassOff: { type: String },
    };

    update() {
        this.props.record.update({ [this.props.name]: !this.props.record.data[this.props.name] });
    }
}

export const booleanLabelField = {
    component: BooleanLabelField,
    displayName: _t("Boolean Label"),
    supportedTypes: ["boolean"],
    extractProps: ({ string, options }) => ({
        label: string,
        btnClassOn: options.btn_class_on ?? "btn-primary",
        btnClassOff: options.btn_class_off ?? "btn-outline-primary",
    }),
};

registry.category("fields").add("mail_boolean_label", booleanLabelField);
