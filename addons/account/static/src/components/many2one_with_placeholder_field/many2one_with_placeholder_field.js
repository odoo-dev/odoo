
import { registry } from "@web/core/registry";
import { Many2OneField, many2OneField } from "@web/views/fields/many2one/many2one_field";
import { _t } from "@web/core/l10n/translation";

import "@mail/js/onchange_on_keydown";

export class Many2OneFieldWithPlaceholderField extends Many2OneField {
    static template = "point_of_sale.Many2OneFieldWithPlaceholderField";
    static props = {
        ...Many2OneField.props,
        placeholderField:  { type: String, optional: true },
    }

    get placeholder() {
        console.log("---------------------------------")
        return this.props.record.data[this.props.placeholderField] || this.props.placeholder;
    }

    get Many2XAutocompleteProps() {
        return {
            ...super().Many2XAutocompleteProps(),
            placeholderField: this.props.placeholderField,
        }
    }
}

export const many2OneFieldWithPlaceholderField = {
    ...many2OneField,
    component: Many2OneFieldWithPlaceholderField,
    supportedOptions: [
        ...many2OneField.supportedOptions,
        {
            label: _t("Placeholder field"),
            name: "placeholder_field",
            type: "field",
            availableTypes: ["char"],
        },
    ],
    extractProps(params, dynamicInfo) {
        return {   
            ...many2OneField.extractProps(params, dynamicInfo),
            placeholderField: params.options.placeholder_field,
        }
    }
}

registry.category("fields").add("many2one_with_placeholder_field", many2OneFieldWithPlaceholderField);