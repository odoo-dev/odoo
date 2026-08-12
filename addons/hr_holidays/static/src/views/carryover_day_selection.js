import { useProps } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { SelectionField, selectionField } from "@web/views/fields/selection/selection_field";


export class CarryoverDaySelection extends SelectionField {    
    props = useProps();

    get options() {
        const allOptions = super.options; 
        const monthFieldName = this.props.monthField;
        const currentMonth = this.props.record.data[monthFieldName];

        if (!monthFieldName || !currentMonth) {
            return allOptions;
        }

        const monthMaxDays = {
            "1": 31, "2": 29, "3": 31, "4": 30, "5": 31, "6": 30,
            "7": 31, "8": 31, "9": 30, "10": 31, "11": 30, "12": 31
        };
        const maxAllowedDays = monthMaxDays[currentMonth];

        return allOptions.filter((option) => parseInt(option[0], 10) <= maxAllowedDays);
    }
}

registry.category("fields").add("carryover_day_widget", {
    ...selectionField,
    component: CarryoverDaySelection,
    
    supportedOptions: [
        ...(selectionField.supportedOptions || []),
        { name: "month_field", type: "string" }
    ],
    
    extractProps: (fieldInfo, dynamicInfo) => {
        const props = selectionField.extractProps(fieldInfo, dynamicInfo);
        
        if (fieldInfo.options && fieldInfo.options.month_field) {
            props.monthField = fieldInfo.options.month_field;
        }
        
        return props;
    }
});
