/** @odoo-module **/

import { CheckBox } from "@web/core/checkbox/checkbox";
import { registry } from "@web/core/registry";
import { standardFieldProps } from "./standard_field_props";
import { _lt } from "@web/core/l10n/translation";

const { Component } = owl;

export class Many2ManyCheckboxesField extends Component {
    isSelected(item) {
        return this.props.value.ids.includes(item[0]);
    }

    onChange(resId, checked) {
        const operation = checked ? "add" : "delete";
        this.props.value[operation](resId);
    }
}

Many2ManyCheckboxesField.components = { CheckBox };
Many2ManyCheckboxesField.template = "web.Many2ManyCheckboxesField";
Many2ManyCheckboxesField.props = {
    ...standardFieldProps,
    items: Object,
};
Many2ManyCheckboxesField.extractProps = (fieldName, record) => {
    return {
        items: record.preloadedData[fieldName],
    };
};
Many2ManyCheckboxesField.displayName = _lt("Checkboxes");
Many2ManyCheckboxesField.supportedTypes = ["many2many"];
Many2ManyCheckboxesField.isEmpty = () => false;

registry.category("fields").add("many2many_checkboxes", Many2ManyCheckboxesField);

export function preloadMany2ManyCheckboxes(orm, record, fieldName) {
    const field = record.fields[fieldName];
    const context = record.evalContext;
    const domain = record.getFieldDomain(fieldName).toList(context);
    return orm.call(field.relation, "name_search", ["", domain]);
}

registry.category("preloadedData").add("many2many_checkboxes", preloadMany2ManyCheckboxes);
