/** @odoo-module **/

import { registry } from "@web/core/registry";
import { _lt } from "@web/core/l10n/translation";
import { standardFieldProps } from "./standard_field_props";
import { CheckBox } from "@web/core/checkbox/checkbox";

const { Component } = owl;

export class BooleanToggleField extends Component {
    /**
     * @param {boolean} newValue
     */
    onChange(newValue) {
        this.props.update(newValue);
    }
}

BooleanToggleField.template = "web.BooleanToggleField";
BooleanToggleField.components = { CheckBox };
BooleanToggleField.props = {
    ...standardFieldProps,
};

BooleanToggleField.displayName = _lt("Toggle");
BooleanToggleField.supportedTypes = ["boolean"];

BooleanToggleField.isEmpty = () => false;
BooleanToggleField.extractProps = (fieldName, record) => {
    return {
        readonly: record.isReadonly(fieldName),
    };
};

registry.category("fields").add("boolean_toggle", BooleanToggleField);
