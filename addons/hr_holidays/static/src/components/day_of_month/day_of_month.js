import { registry } from "@web/core/registry";
import { SelectionField, selectionField } from "@web/views/fields/selection/selection_field";

export class DayOfMonth extends SelectionField {
    static props = {
        ...SelectionField.props,
        month: String,
    };

    get options() {
        const days = this.props.record.fields[this.props.name].selection;
        const month = this.props.record.data[this.props.month];
        // using non-leap year (2025) to avoid having the date set to 29th of Feb and only triggering once every 4 years
        const lastDay = new Date(2025, month, 0).getDate();
        return days.filter((day) => day[0] <= lastDay);
    }
}

export const dayOfMonth = {
    ...selectionField,
    component: DayOfMonth,
    extractProps({ options }) {
        return {
            ...selectionField.extractProps(...arguments),
            month: options.depends_on,
        };
    },
};

registry.category("fields").add("day_of_month", dayOfMonth);
