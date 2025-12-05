import { registry } from "@web/core/registry";
import { SelectionField, selectionField } from "@web/views/fields/selection/selection_field";

export class DayMonthSelectionField extends SelectionField {
    static props = {
        ...SelectionField.props,
        selectedMonth: { type: String, optional: true },
    };


    get options() {
        const selectedMonth = this.props.record.data[this.props.selectedMonth];
        // The year 2024 is used as a default year as it's a leap year so it will alow us to select the 29th of February (to be more generic)
        const date = new Date(2024, selectedMonth, 0); 
        const days = date.getDate();
        let newChoicesList = Array.from({length: days}, (_, i) => [(i + 1).toString(), (i + 1).toString()])
        return newChoicesList;
    }

}

export const dayMonthSelectionField = {
    ...selectionField,
    component: DayMonthSelectionField,
    extractProps: (fieldInfo, dynamicInfo) => {
        const props = selectionField.extractProps(fieldInfo, dynamicInfo);
        props.selectedMonth = fieldInfo.attrs.selected_month;
        return props;
    },
};

registry.category("fields").add("day_month_selection", dayMonthSelectionField);
