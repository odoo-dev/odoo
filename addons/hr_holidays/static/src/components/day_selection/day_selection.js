/** @odoo-module **/
import { registry } from "@web/core/registry";
import { SelectionField, selectionField } from "@web/views/fields/selection/selection_field";

export class DaySelection extends SelectionField {

    static props = {
        ...SelectionField.props,
        monthField: { type: String},
    };
    
    get options() {
        const month = this.props.record.data[this.props.monthField];

        const allDays = this.props.record.fields[this.props.name].selection;
        
        const maxDays = new Date(2024, month, 0).getDate();
        return allDays.filter(opt => parseInt(opt[0]) <= maxDays);
    }
}

export const daySelection={
    ...selectionField,
    component: DaySelection,

    extractProps: ({ options }) => ({
        monthField: options.month_field,
    }),
}

registry.category("fields").add("day_selection", daySelection);
