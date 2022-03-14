/** @odoo-module **/

import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { registry } from "@web/core/registry";
import { _lt } from "@web/core/l10n/translation";
import { standardFieldProps } from "./standard_field_props";

const { Component } = owl;

export class StateSelectionField extends Component {
    get colorClass() {
        if (this.currentValue === "blocked") {
            return "o_status_red";
        } else if (this.currentValue === "done") {
            return "o_status_green";
        }
        return "";
    }
    get currentValue() {
        return this.props.value || this.props.options[0][0];
    }
    get isReadonly() {
        return this.props.record.isReadonly(this.props.name);
    }
    get label() {
        return this.props.options.find((o) => o[0] === this.currentValue)[1];
    }

    /**
     * @param {Event} ev
     */
    onChange(value) {
        this.props.update(value);
    }
}

StateSelectionField.template = "web.StateSelectionField";
StateSelectionField.components = {
    Dropdown,
    DropdownItem,
};
StateSelectionField.defaultProps = {
    hideLabel: false,
};
StateSelectionField.props = {
    ...standardFieldProps,
    hideLabel: { type: Boolean, optional: true },
    options: Object,
};
StateSelectionField.displayName = _lt("Label Selection");
StateSelectionField.supportedTypes = ["selection"];
StateSelectionField.extractProps = (fieldName, record, attrs) => {
    return {
        hideLabel: attrs.options.hide_label,
        options: record.fields[fieldName].selection,
    };
};
registry.category("fields").add("state_selection", StateSelectionField);
