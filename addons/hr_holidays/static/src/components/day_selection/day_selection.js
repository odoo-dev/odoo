import { registry } from "@web/core/registry";
import { SelectionField, selectionField } from "@web/views/fields/selection/selection_field";

export class DaySelection extends SelectionField {
    static props = {
        ...SelectionField.props,
        month: { type: String, optional: true },
    };

    get options() {
        const options = super.options;
        const selectedMonth = this.props.record.data[this.props.month];
        if (!selectedMonth) return options;

        const maxDays = new Date(2024, parseInt(selectedMonth), 0).getDate();
        return options.filter(option => parseInt(option[0]) <= maxDays);
    }
}

export const daySelection = {
    ...selectionField,
    component: DaySelection,
    extractProps({ attrs }) {
        const props = selectionField.extractProps(...arguments);
        props.month = attrs.month;
        return props;
    },
    fieldDependencies: ({ attrs }) => [
        { name: attrs.month, type: "selection" },
    ],
};


registry.category("fields").add("day_selection", daySelection);
