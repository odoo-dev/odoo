import { registry } from "@web/core/registry";
import {
    SelectionField,
    selectionField,
    selectionFieldProps,
} from "@web/views/fields/selection/selection_field";
import { useProps } from "@odoo/owl";

function daysInMonth(month) {
    return new Date(2024, month, 0).getDate();
}

export class SelectionDayInMonthField extends SelectionField {
    props = useProps({
        ...selectionFieldProps,
        month_field: { type: String, optional: false },
    });

    get options() {
        const month_field = this.props.month_field;
        const month = this.props.record.data[month_field] ?? null;
        const cap = daysInMonth(month) || 31;
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
