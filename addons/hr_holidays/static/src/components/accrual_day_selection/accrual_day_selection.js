import { registry } from "@web/core/registry";
import { SelectionField, selectionField } from "@web/views/fields/selection/selection_field";

export class AccrualDaySelection extends SelectionField {
    get options() {
        const options = super.options;
        const monthFieldName = this.props.monthField; 

        if (!monthFieldName) {
            return options;
        }

        const month = this.props.record.data[monthFieldName];
        if (!month) {
            return options;
        }

        // Hardcode a known leap year (e.g., 2024) instead of using the current year.
        // This guarantees February will always evaluate to 29 days.
        const leapYear = 2024;
        const daysInMonth = new Date(leapYear, parseInt(month), 0).getDate();

        return options.filter((option) => {
            const day = parseInt(option[0]);
            return isNaN(day) || day <= daysInMonth;
        });
    }
}

export const accrualDaySelectionField = {
    ...selectionField,
    component: AccrualDaySelection,
    
    extractProps: ({ attrs, options }) => {
        const props = selectionField.extractProps({ attrs, options });
        props.monthField = options.month_field;
        return props;
    },
    
    fieldDependencies: ({ options }) => {
        const deps = selectionField.fieldDependencies ? selectionField.fieldDependencies({ options }) : [];
        if (options && options.month_field) {
            deps.push({ name: options.month_field, type: "selection" });
        }
        return deps;
    },
};

registry.category("fields").add("accrual_day_selection", accrualDaySelectionField);
