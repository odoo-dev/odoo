import { selectionField, SelectionField } from "@web/views/fields/selection/selection_field";
import { registry } from "@web/core/registry";

export class DaySelectionField extends SelectionField {
    static props = {
        ...SelectionField.props,
        month: String,
    };

    get options() {
        let allOptions = super.options;
        const monthValue = this.props.record.data[this.props.month];
        const maxDay = new Date(2020, monthValue, 0).getDate();
        allOptions = allOptions.filter((option) => option[0] <= maxDay);
        return allOptions;
    }
}

export const daySelectionField = {
    ...selectionField,
    component: DaySelectionField,
    extractProps({ attrs }) {
        return {
            ...selectionField.extractProps(...arguments),
            month: attrs.month,
        };
    },
    fieldDependencies: ({ attrs }) => [
        {
            name: attrs.month,
            type: "selection",
        },
    ],
};

registry.category("fields").add("day_selection", daySelectionField);
