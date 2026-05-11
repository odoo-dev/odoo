import { SelectionField, selectionField } from "@web/views/fields/selection/selection_field";
import { registry } from "@web/core/registry";

export class AccrualDaySelection extends SelectionField {
    static props = {
        ...SelectionField.props,
    };
    
    get options() {
        const allOptions = super.options;
        
        const monthFieldName = this.props.monthFieldName;
        
        if (!monthFieldName) return allOptions;
        
        const monthValue = this.props.record.data[monthFieldName];

        if (!monthValue) return allOptions;

        const month = parseInt(monthValue);
        let maxDays = 31;
        if ([4, 6, 9, 11].includes(month)) {
            maxDays = 30;
        } else if (month === 2) {
            maxDays = 29;
        }

        return allOptions.filter((opt) => parseInt(opt[0]) <= maxDays);
    }
}


registry.category("fields").add("accrual_day_dropdown", {
    ...selectionField,
    component: AccrualDaySelection,
    extractProps: (fieldInfo, dynamicInfo) => {
    const props = selectionField.extractProps(fieldInfo,dynamicInfo);
    props.monthFieldName = fieldInfo.options.month_field;
    return props;
},
});
