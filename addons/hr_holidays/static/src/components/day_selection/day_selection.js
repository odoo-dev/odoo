import { registry } from "@web/core/registry";
import { selectionField, SelectionField } from "@web/views/fields/selection/selection_field";

export class DaySelectionField extends SelectionField {
    static props = {
        ...SelectionField.props,
        monthType: { type: String },
    };

    get options() {
        const options = super.options;
        const monthNumber = this.props.record.data[this.props.monthType];

        // Use 2024 to get 29 days for February since it's a leap year
        const lastDay = new Date(2024, parseInt(monthNumber), 0).getDate();
        return options.filter((options) => parseInt(options[0]) <= lastDay);
    }
}

export const daySelectionField = {
    ...selectionField,
    component: DaySelectionField,
    extractProps({ attrs }) {
        return {
            ...selectionField.extractProps(...arguments),
            monthType: attrs.month_type,
        };
    },
};

registry.category("fields").add("day_selection", daySelectionField);
