import { registry } from "@web/core/registry";
import { SelectionField, selectionField } from "@web/views/fields/selection/selection_field";

export class DaySelectionField extends SelectionField {
    static props = {
        ...SelectionField.props,
        monthField: String,
    };

    setup() {
        super.setup();
    }

    get options() {
        // get selected yearly_month value
        const selectedMonth = this.props.record.data[this.props.monthField];

        // set maxDays if months isn't selected
        let maxDays = 31;

        if (selectedMonth) {
            // using year = 2020 (leap year) to return [1, 29] days
            maxDays = new Date(2020, parseInt(selectedMonth), 0).getDate();
        }

        return super.options.filter(x => parseInt(x[0]) <= maxDays);
    }
}

export const daySelectionField = {
    ...selectionField,
    component: DaySelectionField,
    extractProps({ attrs }) {
        return {
            ...selectionField.extractProps(...arguments),
            monthField: attrs.month_field,
        };
    },
    fieldDependencies: ({ attrs }) => [
        {
            name: attrs.month_field,
            type: "selection",
        },
    ],
};

registry.category("fields").add("day_selection", daySelectionField);
