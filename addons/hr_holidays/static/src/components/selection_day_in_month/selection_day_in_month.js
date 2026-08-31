import { registry } from "@web/core/registry";
import {
    SelectionField,
    selectionField,
    selectionFieldProps,
} from "@web/views/fields/selection/selection_field";
import { useProps } from "@odoo/owl";

const DAYS_PER_MONTH = {
    '1': 31, '2': 29, '3': 31, '4': 30, '5': 31, '6': 30,
    '7': 31, '8': 31, '9': 30, '10': 31, '11': 30, '12': 31,
};

export class SelectionDayInMonthField extends SelectionField {
    props = useProps({
        ...selectionFieldProps,
        month_field: { type: String, optional: false },
    });

    get options() {
        const month_field = this.props.month_field;

        const month = this.props.record.data[month_field] ?? null;
  
        console.log(month);

        const cap = DAYS_PER_MONTH[month] || 31;
        
        const days = [];
        for (let i = 1; i <= cap; i++) {
            days.push([i.toString(), i.toString()]);
        }
        
        return days;
    }
}

export const selectionDayInMonthField = {
    ...selectionField,
    component: SelectionDayInMonthField,
    
    extractProps({ options }) {
        const props = selectionField.extractProps(...arguments);
        props.month_field = options.month_field;

        return props;
    },
};

registry.category("fields").add("selection_day_in_month", selectionDayInMonthField);