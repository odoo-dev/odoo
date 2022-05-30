/** @odoo-module **/

import { registry } from "@web/core/registry";
import { _lt } from "@web/core/l10n/translation";
import { standardFieldProps } from "./standard_field_props";

const { Component } = owl;

export class PercentageField extends Component {
    /**
     * @param {Event} ev
     */
    onChange(ev) {
        let parsedValue;
        try {
            parsedValue = this.props.parse(ev.target.value);
        } catch (_e) {
            // WOWL TODO: rethrow error when not the expected type
            this.props.setAsInvalid(this.props.name);
            return;
        }
        this.props.update(parsedValue);
    }

    get formattedValue() {
        return this.props.format(this.props.value, {
            digits: this.props.digits,
        });
    }
}

PercentageField.template = "web.PercentageField";
PercentageField.defaultProps = {
    setAsInvalid: () => {},
};
PercentageField.props = {
    ...standardFieldProps,
    setAsInvalid: { type: Function, optional: true },
    digits: { type: Array, optional: true },
};
PercentageField.extractProps = (fieldName, record, attrs) => {
    return {
        setAsInvalid: record.setInvalidField.bind(record),
        digits:
            (attrs.digits ? JSON.parse(attrs.digits) : attrs.options.digits) ||
            record.fields[fieldName].digits,
    };
};
PercentageField.displayName = _lt("Percentage");
PercentageField.supportedTypes = ["integer", "float"];

registry.category("fields").add("percentage", PercentageField);
