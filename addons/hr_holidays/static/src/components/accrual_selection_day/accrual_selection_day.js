import { selectionField, SelectionField } from "@web/views/fields/selection/selection_field";
import { registry } from "@web/core/registry";

export class AccrualSelectionDay extends SelectionField {
    static props = {
        ...SelectionField.props,
        monthField: { type: String },
    };

    get options() {
        const monthField = this.props.monthField;
        const month = monthField ? this.props.record.data[monthField] : null;
        const allOptions = super.options;

        if (!month) {
            return allOptions;
        }

        const maxDays = new Date(2020, parseInt(month), 0).getDate();

        return allOptions.filter((opt) => parseInt(opt[0]) <= maxDays);
    }
}


registry.category("fields").add("accrual_selection_day",{
    ...selectionField,
    component: AccrualSelectionDay,
    extractProps: (fieldInfo, dynamicInfo) => {
        const props = selectionField.extractProps(fieldInfo,dynamicInfo);
        props.monthField = fieldInfo.options.month_field;
        return props;
    },
});
