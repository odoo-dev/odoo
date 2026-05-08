import { SelectionField, selectionField } from "@web/views/fields/selection/selection_field";
import { registry } from "@web/core/registry";

export class YearlyDaySelectionField extends SelectionField {
    static props = {
        ...SelectionField.props,
        // The name of the field that references the model whose fields will be shown to the user when using /field
        month: { type: String },
    };

    get choices() {
        const original_choices = super.choices;
        const month = this.props.month;
        const monthVal = parseInt(this.props.record.data[month]);
        const n_days = luxon.DateTime.local(2020, monthVal).daysInMonth;
        return original_choices.filter((option) => parseInt(option.value) <= n_days );
    }
}

export const yearlyDaySelectionField = {
    ...selectionField,
    component: YearlyDaySelectionField,
    extractProps({attrs, options}, dynamicInfo){
        const props = selectionField.extractProps(...arguments);
        const month = options.month;
        return { ...props, month};
    }
}
// Register the widget
registry.category("fields").add("yearly_day_selection_field", yearlyDaySelectionField);
