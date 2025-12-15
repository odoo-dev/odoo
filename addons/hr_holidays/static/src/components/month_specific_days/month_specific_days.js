import { registry } from "@web/core/registry";
import { SelectionField, selectionField } from "@web/views/fields/selection/selection_field";

export class MonthSpecificDays extends SelectionField {
    static props = {
        ...SelectionField.props,
        monthFieldName: String,
    };

    get options() {
        const days = this.props.record.fields[this.props.name].selection;
        const month = this.props.record.data[this.props.monthFieldName];
        const lastDay = new Date(2024, month, 0).getDate(); // method call will return last day of the month, used 2024 as it's a leap year
        return days.filter((day) => day[0] <= lastDay);
    }
}

export const monthSpecificDays = {
    ...selectionField,
    component: MonthSpecificDays,
    extractProps({ options }) {
        return {
            ...selectionField.extractProps(...arguments),
            monthFieldName: options.depends_on,
        };
    },
};

registry.category("fields").add("month_specific_days", monthSpecificDays);
