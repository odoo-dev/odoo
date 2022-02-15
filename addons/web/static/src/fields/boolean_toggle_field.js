/** @odoo-module **/

import { registry } from "@web/core/registry";
import { _lt } from "@web/core/l10n/translation";
import { standardFieldProps } from "./standard_field_props";
import { CheckBox } from "@web/core/checkbox/checkbox";

const { Component } = owl;

export class BooleanToggleField extends Component {
    /**
     * @param {Event} ev
     */
    onChange(newValue) {
        this.props.update(newValue);
    }
    /**
     * @param {MouseEvent} ev
     */
    onKeydown({ key }) {
        switch (key) {
            case "Enter":
                this.props.update(!this.props.value);
                break;
        }
    }
}

Object.assign(BooleanToggleField, {
    template: "web.BooleanToggleField",
    props: {
        ...standardFieldProps,
    },

    displayName: _lt("Toggle"),
    supportedTypes: ["boolean"],

    isEmpty() {
        return false;
    },
    components: { CheckBox },
});

registry.category("fields").add("boolean_toggle", BooleanToggleField);
